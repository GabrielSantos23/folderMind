use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const CLASSIFIER_URL: &str = "http://localhost:8000/classify";
const CLASSIFIER_BATCH_URL: &str = "http://localhost:8000/classify-batch";

#[derive(Serialize)]
struct ClassifyRequest {
    filename: String,
    extension: String,
    categories: Vec<String>,
    file_path: Option<String>,
    use_vision: bool,
}

#[derive(Serialize)]
pub struct BatchFileItem {
    pub filename: String,
    pub extension: String,
    pub file_path: Option<String>,
}

#[derive(Serialize)]
struct BatchClassifyRequest {
    files: Vec<BatchFileItem>,
    categories: Vec<String>,
    use_vision: bool,
}

#[derive(Deserialize, Clone)]
pub struct ClassifyResponse {
    pub category: String,
    pub is_vision: bool,
}

#[derive(Deserialize)]
pub struct BatchClassifyResponse {
    pub results: Vec<ClassifyResponse>,
}

pub fn classify_file(
    client: &Client,
    filename: &str,
    extension: &str,
    categories: &[String],
    file_path: Option<&str>,
    use_vision: bool,
    api_key: &str,
) -> Result<ClassifyResponse, String> {
    let request = ClassifyRequest {
        filename: filename.to_string(),
        extension: extension.to_string(),
        categories: categories.to_vec(),
        file_path: file_path.map(String::from),
        use_vision,
    };

    let mut req = client.post(CLASSIFIER_URL).json(&request);
    if !api_key.is_empty() {
        req = req.header("X-Groq-Api-Key", api_key);
    }

    let response = req
        .timeout(Duration::from_secs(30))
        .send()
        .map_err(|e| format!("Failed to reach classifier server: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        return Err(format!("Classifier error ({}): {}", status, body));
    }

    response
        .json::<ClassifyResponse>()
        .map_err(|e| format!("Failed to parse classifier response: {}", e))
}

pub fn classify_batch(
    client: &Client,
    files: Vec<BatchFileItem>,
    categories: &[String],
    use_vision: bool,
    api_key: &str,
) -> Result<Vec<ClassifyResponse>, String> {
    if files.is_empty() {
        return Ok(Vec::new());
    }

    let request = BatchClassifyRequest {
        files,
        categories: categories.to_vec(),
        use_vision,
    };

    let mut req = client.post(CLASSIFIER_BATCH_URL).json(&request);
    if !api_key.is_empty() {
        req = req.header("X-Groq-Api-Key", api_key);
    }

    let response = req
        .timeout(Duration::from_secs(120))
        .send()
        .map_err(|e| format!("Failed to reach classifier server: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        return Err(format!("Classifier error ({}): {}", status, body));
    }

    let raw_body = response
        .text()
        .map_err(|e| format!("Failed to read response body: {}", e))?;
    log::info!("Batch response: {}", raw_body);

    let batch_response: BatchClassifyResponse = serde_json::from_str(&raw_body)
        .map_err(|e| format!("Failed to parse classifier response: {}", e))?;

    log::info!("Parsed {} results", batch_response.results.len());

    Ok(batch_response.results)
}
