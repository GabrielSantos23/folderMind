<p align="center">
  <img src="apps/web/src/assets/logo.png" width="120" />
</p>

<h1 align="center">FolderMind</h1>

<p align="center">
  <strong>Organizador de arquivos inteligente com IA</strong><br>
  Classifica, organiza e estrutura seus arquivos automaticamente usando inteligência artificial.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/Rust-Backend-orange?logo=rust" alt="Rust" />
  <img src="https://img.shields.io/badge/Groq-LLM-green" alt="Groq LLM" />
  <img src="https://img.shields.io/badge/Llama_4-Scout-purple" alt="Llama 4 Scout" />
</p>

---

## 🎥 Demo

<p align="center">
  <video src="apps/web/src/assets/desktop_demo.mp4" width="100%" controls autoplay loop muted></video>
</p>

---

## Sobre

**FolderMind** é um organizador de arquivos com IA que analisa a estrutura de diretórios e classifica cada arquivo automaticamente, sugerindo uma hierarquia ideal de pastas. Disponível como **app desktop nativo** (Windows, macOS, Linux) e como **versão web** acessível pelo navegador.

O sistema utiliza o modelo **Llama 4 Scout** via **Groq** para classificação semântica, com suporte opcional a **visão computacional** para analisar o conteúdo visual de imagens.

---

## Funcionalidades

### Funcionalidades Compartilhadas (Desktop e Web)

| Funcionalidade                  | Descrição                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 🤖 **Classificação com IA**     | Cada arquivo é analisado e categorizado automaticamente usando LLM (Llama 4 Scout via Groq)                  |
| 👁️ **Análise de Visão**         | Imagens, capturas de tela e arquivos de design são classificados pelo conteúdo visual usando modelo de visão |
| 🔍 **Análise Profunda**         | Lê o conteúdo interno dos arquivos para melhorar a precisão da classificação                                 |
| 🔄 **Detecção de Duplicatas**   | Encontra arquivos duplicados por hash, nome ou ambos                                                         |
| 📊 **Plano de Organização**     | Gera um plano visual mostrando a estrutura de pastas sugerida com nível de confiança                         |
| ✏️ **Edição do Plano**          | Renomear pastas, mover arquivos entre categorias e excluir arquivos diretamente no plano                     |
| 🎨 **Temas**                    | Suporte a temas claro, escuro e automático (segue o sistema)                                                 |
| ⚙️ **Configurações**            | Ajuste de modelo de visão (rápido/preciso), modo de deduplicação, tamanho máximo de arquivo e mais           |
| 💬 **Interface de Chat**        | Interação conversacional com o assistente de IA durante a análise                                            |
| 📁 **Drag & Drop**              | Arraste pastas (desktop) ou arquivos (web) diretamente na interface                                          |
| 📋 **Barra Lateral de Sessões** | Lista de sessões anteriores com navegação rápida                                                             |
| 📐 **Sidebar de Plano**         | Visualização em árvore do plano de organização com ações contextuais                                         |

### Funcionalidades Exclusivas — App Desktop

| Funcionalidade                      | Descrição                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| 📂 **Seleção Nativa de Pastas**     | Diálogo nativo do sistema operacional para selecionar diretórios                                  |
| ✅ **Aplicar Plano**                | Move os arquivos fisicamente no disco para as pastas sugeridas pela IA                            |
| ⚡ **Auto-aplicação**               | Opção para aplicar o plano automaticamente ao concluir a análise, sem revisão                     |
| ⚠️ **Confirmação Antes de Aplicar** | Diálogo de confirmação antes de mover qualquer arquivo                                            |
| 🗑️ **Exclusão de Arquivos**         | Exclui permanentemente arquivos do disco diretamente pelo plano                                   |
| 💾 **Histórico Persistente**        | Sessões salvas em banco SQLite local com retenção configurável (7, 14, 30 ou 90 dias)             |
| 🔄 **Limpeza Automática**           | Sessões antigas são removidas automaticamente com base no período configurado                     |
| 🧹 **Limpar Histórico**             | Opção para limpar todo o histórico de sessões de uma vez                                          |
| 🔔 **Notificações Nativas**         | Notificações do sistema quando a análise ou organização é concluída                               |
| 🪟 **Barra de Título Customizada**  | Titlebar personalizada com controles de minimizar, maximizar e fechar                             |
| 🙈 **Excluir Ocultos**              | Opção para ignorar arquivos e pastas que começam com ponto (`.`)                                  |
| 📝 **Padrões de Exclusão**          | Lista personalizável de nomes de arquivos/pastas a serem ignorados (`.git`, `node_modules`, etc.) |
| 📡 **Watcher em Tempo Real**        | Monitora uma pasta e organiza novos arquivos automaticamente conforme são adicionados             |

### Funcionalidades Exclusivas — Versão Web

| Funcionalidade               | Descrição                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ☁️ **Upload de Arquivos**    | Selecione ou arraste múltiplos arquivos via `<input type="file">`                                                             |
| 📦 **Download como ZIP**     | Ao concluir a análise, baixe um arquivo ZIP contendo o plano de organização com a estrutura de pastas e manifesto de arquivos |
| 🌐 **Acesso pelo Navegador** | Sem instalação necessária, acesse diretamente pelo navegador                                                                  |
| 🧪 **Modo Demo**             | Análise simulada quando o backend do classificador não está disponível                                                        |

---

## Arquitetura

```
file-organizer-2.0/
├── apps/
│   ├── web/                  # Frontend React + TanStack Router + Vite
│   │   ├── src/
│   │   │   ├── routes/       # Páginas (organizer, settings)
│   │   │   ├── components/   # Componentes UI reutilizáveis
│   │   │   ├── hooks/        # Hooks customizados (settings, mobile)
│   │   │   └── lib/          # Utilitários (platform, settings-config)
│   │   └── index.html
│   ├── server/               # Backend API (Hono + tRPC)
│   └── python-classifier/    # Classificador IA (FastAPI + Groq + Llama 4)
├── packages/
│   ├── api/                  # Camada de API compartilhada
│   ├── db/                   # Schema do banco de dados (Drizzle + SQLite)
│   └── env/                  # Variáveis de ambiente tipadas
├── src-tauri/                # Backend Rust (Tauri 2)
│   └── src/
│       ├── lib.rs            # Comandos Tauri (analyze, apply, delete, etc.)
│       ├── analyzer.rs       # Motor de análise e organização de arquivos
│       ├── classifier.rs     # Cliente HTTP para o classificador Python
│       ├── database.rs       # Banco SQLite local para sessões
│       └── watcher.rs        # Monitor de diretórios em tempo real
└── bts.jsonc                 # Configuração Better-T-Stack
```

---

## Stack Tecnológica

| Camada               | Tecnologia                                                 |
| -------------------- | ---------------------------------------------------------- |
| **Frontend**         | React 19, TanStack Router, Vite, Tailwind CSS 4, shadcn/ui |
| **Desktop**          | Tauri 2 (Rust)                                             |
| **Classificador IA** | Python, FastAPI, Groq SDK, Llama 4 Scout                   |
| **Banco de Dados**   | SQLite (local via Tauri), SQLite/Turso (servidor)          |
| **ORM**              | Drizzle ORM                                                |
| **API**              | Hono, tRPC                                                 |
| **Runtime**          | Bun                                                        |

---

## Primeiros Passos

### Pré-requisitos

- [Bun](https://bun.sh) (v1.2+)
- [Rust](https://www.rust-lang.org/tools/install) (para o app desktop)
- [Python 3.10+](https://www.python.org/) (para o classificador IA)
- Chave de API do [Groq](https://console.groq.com/keys)

### Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/file-organizer-2.0.git
cd file-organizer-2.0

# 2. Instale as dependências
bun install

# 3. Configure o classificador Python
cd apps/python-classifier
python -m venv venv
venv/Scripts/activate       # Windows
# source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt

# 4. Configure as variáveis de ambiente
cp .env.example .env
# Edite .env e adicione sua GROQ_API_KEY
```

### Executando o App Desktop

```bash
# Inicia o Tauri + Vite + Classificador Python em modo desenvolvimento
bun run dev:desktop
```

### Executando a Versão Web

```bash
# Inicia todos os serviços (web + server + classifier)
bun run dev
```

Acesse [http://localhost:3001](http://localhost:3001) no navegador.

### Apenas o Frontend Web

```bash
bun run dev:web
```

### Apenas o Servidor API

```bash
bun run dev:server
```

---

## Configuração do Banco de Dados

O projeto usa SQLite com Drizzle ORM para o servidor.

```bash
# Aplicar schema ao banco
bun run db:push

# Abrir o Drizzle Studio (interface visual)
bun run db:studio

# Gerar tipos do banco
bun run db:generate

# Rodar migrações
bun run db:migrate
```

---

## Scripts Disponíveis

| Script                | Descrição                                                |
| --------------------- | -------------------------------------------------------- |
| `bun run dev`         | Inicia todos os apps em modo desenvolvimento             |
| `bun run build`       | Compila todos os apps para produção                      |
| `bun run dev:web`     | Inicia apenas o frontend web                             |
| `bun run dev:server`  | Inicia apenas o servidor API                             |
| `bun run dev:desktop` | Inicia o app desktop Tauri em modo desenvolvimento       |
| `bun run check-types` | Executa verificação de tipos TypeScript em todos os apps |
| `bun run db:push`     | Aplica alterações do schema ao banco de dados            |
| `bun run db:studio`   | Abre a interface visual do Drizzle Studio                |
| `bun run db:generate` | Gera os tipos e cliente do banco                         |
| `bun run db:migrate`  | Executa as migrações do banco de dados                   |
| `bun run db:local`    | Inicia o banco SQLite local                              |

---

## Detecção de Plataforma

O app detecta automaticamente se está rodando no **Tauri (desktop)** ou no **navegador (web)** e adapta a interface:

- **Desktop:** Mostra titlebar customizada, seleção nativa de pastas, operações de arquivo no disco, histórico persistente em SQLite e notificações do sistema.
- **Web:** Mostra upload de arquivos, botão de download ZIP do plano e análise simulada quando o classificador não está disponível.

As configurações também se adaptam por plataforma — seções como "Histórico & Armazenamento", "Comportamento de Organização" e "Notificações" são exibidas apenas no desktop.

---

## Variáveis de Ambiente

### Classificador Python (`apps/python-classifier/.env`)

```env
GROQ_API_KEY=sua_chave_aqui
MODEL=meta-llama/llama-4-scout-17b-16e-instruct
```

### Servidor (`apps/server/.env`)

```env
DATABASE_URL=file:./local.db
```

---

## Licença

MIT — veja [LICENSE](LICENSE) para mais detalhes.

---

<p align="center">
  Feito com ❤️ usando Tauri, React, Rust e Llama 4 Scout
</p>
