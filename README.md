# Bi-Amazon

基于 BSR 类目数据的 BI 分析与决策系统，目标是支持亚马逊类目分析、竞品对比和运营策略闭环。

## 项目结构

```text
Bi-Amazon/
├── PRD/                  # 产品需求文档
├── backend/              # FastAPI 后端
└── fronted/              # React + Vite 前端（目录名当前为 fronted）
```

## 技术栈

- 后端: FastAPI + Uvicorn + MySQL（`pymysql`）
- 前端: React + TypeScript + Vite + Ant Design
- 部署: Docker / Docker Compose

## 本地开发

### 1) 启动后端

```bash
cd backend
cp .env.example .env
# 按需修改 .env 中数据库和 API Key 配置

pip install -r requirements.txt
python main.py
```

- 默认端口: `18765`
- 健康检查: `http://127.0.0.1:18765/health`

### 2) 启动前端

```bash
cd fronted
npm ci
# 按需修改 .env 中 VITE_API_BASE_URL
npm run dev
```

## Docker 部署

### 1) 启动后端容器

```bash
cd backend
cp .env.example .env
# 按需修改 .env（如 DB_HOST、DB_USER、DB_PASSWORD）

docker compose up -d --build
```

### 2) 启动前端容器

```bash
cd fronted
# 示例: echo 'VITE_API_BASE_URL=http://your-backend-host:18765' > .env
docker compose up -d --build
```

- 前端默认映射端口: `5174`
- 后端默认映射端口: `18765`

## 服务器从 GitHub 更新

```bash
cd /opt/Bi-Amazon
git pull origin main

cd backend && docker compose up -d --build
cd ../fronted && docker compose up -d --build
```

## 注意事项

- 不要提交 `node_modules/`、`dist/`、运行日志和本地敏感配置。
- `.env` 建议在服务器本地维护，不要放入公开仓库。
