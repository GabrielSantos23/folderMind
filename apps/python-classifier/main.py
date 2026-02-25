

import asyncio
import base64
import os
import sys
import time
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pydantic import BaseModel

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError(
        "GROQ_API_KEY is not set. "
        "Create a .env file with GROQ_API_KEY=your_key or set it as an environment variable."
    )

client = Groq(api_key=GROQ_API_KEY)

MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".bmp",
    ".tiff",
    ".tif",
}

VISION_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".bmp",
}

MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".svg": "image/svg+xml",
}

SYSTEM_PROMPT = (
    "You are a smart file-classification engine. "
    "You will receive a filename, its extension, and a list of existing category names. "
    "Your job is to reply with the single best-matching category name.\n"
    "Rules you MUST follow:\n"
    "1. If the file fits one of the existing categories, reply with EXACTLY that category name.\n"
    "2. If the file does NOT fit any existing category, invent a short, descriptive new category name (2-4 words, Title Case). "
    "For example: 'Fonts & Typography', '3D Models', 'Database Files', 'Config Files'.\n"
    "3. Do NOT add any markdown, quotes, punctuation, explanation, or conversational text.\n"
    "4. Do NOT use the word 'Other' as a category. Always pick a meaningful name.\n"
    "5. Your entire response must be a single line containing only the category name."
)

VISION_SYSTEM_PROMPT = (
    "You are a strict image-classification engine. "
    "You will receive an image and a list of allowed category names. "
    "Your job is to classify the image and return EXACTLY ONE category name from the provided list.\n"
    "Rules you MUST follow:\n"
    "1. Reply with EXACTLY one category name from the provided list — nothing else.\n"
    "2. Do NOT add any markdown, quotes, explanation, or conversational text.\n"
    "3. Do NOT invent new categories. Pick only from the provided list.\n"
    "4. If unsure, reply with 'Images & Screenshots'.\n"
    "5. Your entire response must be a single line containing only the category name."
)

app = FastAPI(
    title="File Classifier",
    description="Classifies files into categories using Groq LLM",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)




class ClassifyRequest(BaseModel):
    """Incoming file metadata from the Rust backend."""

    filename: str
    extension: str
    categories: list[str]
    file_path: str | None = (
        None  
    )
    use_vision: bool = (
        False  
    )


class ClassifyResponse(BaseModel):
    """Outgoing classification result."""

    category: str
    is_vision: bool = False  


class BatchFileItem(BaseModel):
    """Single file in a batch request."""

    filename: str
    extension: str
    file_path: str | None = None


class BatchClassifyRequest(BaseModel):
    """Batch classification request."""

    files: list[BatchFileItem]
    categories: list[str]
    use_vision: bool = False


class BatchClassifyResponse(BaseModel):
    """Batch classification response."""

    results: list[ClassifyResponse]


BATCH_SIZE = 20     

BATCH_SYSTEM_PROMPT = (
    "You are a smart file-classification engine. "
    "You will receive a list of files (filename + extension) and a list of existing category names. "
    "Your job is to classify EACH file and return a JSON array of category names.\n"
    "Rules you MUST follow:\n"
    "1. Return a JSON array of strings, one category per file, in the same order.\n"
    "2. If a file fits an existing category, use EXACTLY that category name.\n"
    "3. If a file does NOT fit any existing category, invent a short, descriptive new category name (2-4 words, Title Case). "
    "For example: 'Fonts & Typography', '3D Models', 'Database Files', 'Config Files'.\n"
    "4. Do NOT add any markdown, explanation, or conversational text.\n"
    "5. Do NOT use 'Other' as a category. Always pick a meaningful, descriptive name.\n"
    "6. Your response must ONLY be the JSON array, nothing else.\n"
    'Example response: ["Documents", "Images & Screenshots", "Fonts & Typography"]'
)




@app.get("/health")
async def health_check():
    """Simple liveness probe."""
    return {"status": "ok", "model": MODEL}


@app.post("/classify", response_model=ClassifyResponse)
async def classify_file(req: ClassifyRequest):
    """
    Classify a file into one of the provided categories.

    For images: uses vision to analyze the actual image content and
    generates a descriptive folder name based on what's in the image.

    For other files: uses the filename + extension to pick the best
    match from the supplied category list.
    """

    if not req.categories:
        raise HTTPException(
            status_code=400,
            detail="At least one category must be provided.",
        )

    ext_lower = req.extension.lower()
    is_image = ext_lower in IMAGE_EXTENSIONS

    if is_image and req.file_path and req.use_vision:
        try:
            return await _classify_image(req.file_path, ext_lower)
        except FileNotFoundError:
            pass
        except Exception as e:
            print(f"Vision classification failed, falling back to text: {e}")

    return await _classify_by_name(req)


@app.post("/classify-batch", response_model=BatchClassifyResponse)
async def classify_batch(req: BatchClassifyRequest):
    """
    Classify multiple files in batches to avoid API overload.

    Files are processed in chunks of BATCH_SIZE with retries.
    """
    if not req.files:
        return BatchClassifyResponse(results=[])

    if not req.categories:
        raise HTTPException(
            status_code=400,
            detail="At least one category must be provided.",
        )

    results: list[ClassifyResponse] = [
        ClassifyResponse(category="Other") for _ in req.files
    ]
    image_indices: list[int] = []
    text_indices: list[int] = []

    for i, f in enumerate(req.files):
        ext_lower = f.extension.lower()
        if ext_lower in IMAGE_EXTENSIONS and f.file_path and req.use_vision:
            image_indices.append(i)
        else:
            text_indices.append(i)

    if text_indices:
        text_files = [req.files[i] for i in text_indices]

        for batch_start in range(0, len(text_files), BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE, len(text_files))
            batch_files = text_files[batch_start:batch_end]
            batch_indices = text_indices[batch_start:batch_end]

            try:
                batch_results = await _classify_batch_text_with_retry(
                    batch_files, req.categories
                )
                for idx, result in zip(batch_indices, batch_results):
                    results[idx] = result
            except Exception as e:
                print(f"Batch classification failed, falling back to individual: {e}")
                for idx in batch_indices:
                    f = req.files[idx]
                    try:
                        result = await _classify_by_name_with_retry(
                            f.filename, f.extension, req.categories
                        )
                        results[idx] = result
                    except Exception:
                        pass  
                await asyncio.sleep(0.5)

    for idx in image_indices:
        f = req.files[idx]
        ext_lower = f.extension.lower()
        try:
            if f.file_path:
                result = await _classify_image(f.file_path, ext_lower)
            else:
                raise Exception("No file path")
        except Exception as e:
            print(f"Vision classification failed for {f.filename}: {e}")
            try:
                result = await _classify_by_name_with_retry(
                    f.filename, f.extension, req.categories
                )
            except Exception:
                result = ClassifyResponse(category="Images & Screenshots")
        results[idx] = result
        await asyncio.sleep(0.1)

    return BatchClassifyResponse(results=results)


async def _classify_batch_text_with_retry(
    files: list[BatchFileItem], categories: list[str], max_retries: int = 3
) -> list[ClassifyResponse]:
    """Classify a batch of files with exponential backoff retry."""

    for attempt in range(max_retries):
        try:
            return await _classify_batch_text(files, categories)
        except Exception as e:
            error_str = str(e).lower()

            if (
                "503" in error_str
                or "over capacity" in error_str
                or "rate" in error_str
            ):
                wait_time = (2**attempt) + 1  # 2, 3, 5 seconds
                print(
                    f"API overloaded, waiting {wait_time}s before retry {attempt + 1}/{max_retries}"
                )
                await asyncio.sleep(wait_time)
            else:
                raise

    return await _classify_batch_text(files, categories)


async def _classify_by_name_with_retry(
    filename: str, extension: str, categories: list[str], max_retries: int = 3
) -> ClassifyResponse:
    """Classify a single file with retry logic."""

    for attempt in range(max_retries):
        try:
            return await _classify_by_name(
                ClassifyRequest(
                    filename=filename,
                    extension=extension,
                    categories=categories,
                    file_path=None,
                    use_vision=False,
                )
            )
        except Exception as e:
            error_str = str(e).lower()

            if (
                "503" in error_str
                or "over capacity" in error_str
                or "rate" in error_str
            ):
                wait_time = (2**attempt) + 0.5
                print(f"API overloaded, waiting {wait_time}s before retry")
                await asyncio.sleep(wait_time)
            else:
                raise

    return await _classify_by_name(
        ClassifyRequest(
            filename=filename,
            extension=extension,
            categories=categories,
            file_path=None,
            use_vision=False,
        )
    )


async def _classify_batch_text(
    files: list[BatchFileItem], categories: list[str]
) -> list[ClassifyResponse]:
    """Classify multiple files in a single LLM request."""

    file_list = "\n".join(
        [
            f"{i + 1}. {f.filename} (extension: {f.extension})"
            for i, f in enumerate(files)
        ]
    )

    user_message = (
        f"Classify these {len(files)} files into one of these categories: {', '.join(categories)}\n\n"
        f"Files:\n{file_list}\n\n"
        f"Return a JSON array with {len(files)} category names."
    )

    chat_completion = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": BATCH_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.0,
        max_tokens=500,
    )

    raw_answer = chat_completion.choices[0].message.content or "[]"
    print(f"Batch raw response: {raw_answer[:200]}...")

    import json

    cleaned = raw_answer.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    categories_found = json.loads(cleaned)
    print(
        f"Parsed {len(categories_found) if isinstance(categories_found, list) else 1} categories from batch"
    )

    if not isinstance(categories_found, list):
        categories_found = [categories_found]

    results = []
    lower_map = {c.lower(): c for c in categories}

    for i, f in enumerate(files):
        if i < len(categories_found):
            cat = str(categories_found[i]).strip()
            if cat in categories:
                category = cat
            elif cat.lower() in lower_map:
                category = lower_map[cat.lower()]
            else:
                for char in '<>:"/\\|?*':
                    cat = cat.replace(char, '')
                category = cat.strip() if cat.strip() else "Miscellaneous"
        else:
            category = "Miscellaneous"
        results.append(ClassifyResponse(category=category))

    return results


async def _classify_image(
    file_path: str, ext_lower: str, categories: list[str] | None = None
) -> ClassifyResponse:
    """Classify an image by its visual content using the vision model."""

    path = Path(file_path)
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"Image file not found: {file_path}")

    image_bytes = path.read_bytes()
    base64_image = base64.b64encode(image_bytes).decode("utf-8")
    mime_type = MIME_TYPES.get(ext_lower, "image/jpeg")
    data_url = f"data:{mime_type};base64,{base64_image}"

    if categories:
        user_text = (
            f"Classify this image into one of these categories: {', '.join(categories)}"
        )
    else:
        user_text = "Analyze this image and classify it appropriately."

    chat_completion = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": VISION_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": user_text,
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": data_url},
                    },
                ],
            },
        ],
        temperature=0.0,
        max_tokens=30,
    )

    raw_answer = (chat_completion.choices[0].message.content or "").strip()

    if categories:
        lower_map = {c.lower(): c for c in categories}
        if raw_answer in categories:
            category = raw_answer
        else:
            category = lower_map.get(raw_answer.lower(), "Images & Screenshots")
    else:
        category = raw_answer.strip("\"' `*#")
        for char in '<>:"/\\|?*':
            category = category.replace(char, "")
        category = category.strip()
        if not category:
            category = "Images & Screenshots"

    return ClassifyResponse(category=category, is_vision=True)


async def _classify_by_name(req: ClassifyRequest) -> ClassifyResponse:
    """Classify a file by its filename and extension using text analysis."""

    user_message = (
        f"Filename: {req.filename}\n"
        f"Extension: {req.extension}\n"
        f"Categories: {', '.join(req.categories)}"
    )

    try:
        chat_completion = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.0,
            max_tokens=50,
        )

        raw_answer = chat_completion.choices[0].message.content.strip()

        if raw_answer in req.categories:
            category = raw_answer
        else:
            lower_map = {c.lower(): c for c in req.categories}
            if raw_answer.lower() in lower_map:
                category = lower_map[raw_answer.lower()]
            else:
                sanitized = raw_answer
                for char in '<>:"/\\|?*':
                    sanitized = sanitized.replace(char, '')
                category = sanitized.strip() if sanitized.strip() else "Miscellaneous"

        return ClassifyResponse(category=category)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Groq API error: {str(e)}",
        )


if __name__ == "__main__":
    import uvicorn

    print(f"Starting File Classifier on http://localhost:8000")
    print(f"Model: {MODEL}")
    print(f"Docs: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)
