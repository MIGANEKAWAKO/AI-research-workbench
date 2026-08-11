# fastapi-note-server

这是 `ai-note-server` 的 FastAPI 迁移版，目标是保持现有前端可直接切换使用。

## 启动

建议使用 Python 3.12 创建虚拟环境：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
```

## 环境变量

复制 `.env.example` 为 `.env`，填写以下配置：

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `PORT`

## 接口

- `POST /api/chat`
- `GET /health`

`POST /api/chat` 保持 SSE 输出格式，前端可继续按 `data: {...}` 的方式解析。

