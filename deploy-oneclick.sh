#!/bin/bash
# Speaking 项目一键部署脚本
# 使用方法：在服务器上执行 bash deploy-oneclick.sh

set -e

echo "========================================="
echo "  Speaking 项目一键部署"
echo "  服务器: 47.122.109.52"
echo "========================================="

PROJECT_DIR="/opt/speaking"

# 1. 安装必要工具
echo ""
echo "[1/6] 检查并安装必要工具..."
if ! command -v docker &> /dev/null; then
    echo "安装 Docker..."
    curl -fsSL https://get.docker.com | bash
    systemctl start docker
    systemctl enable docker
fi

if ! command -v docker-compose &> /dev/null; then
    echo "安装 Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

if ! command -v git &> /dev/null; then
    echo "安装 Git..."
    apt-get update && apt-get install -y git || yum install -y git
fi

echo "✓ Docker: $(docker --version)"
echo "✓ Docker Compose: $(docker-compose --version)"
echo "✓ Git: $(git --version)"

# 2. 克隆或更新代码
echo ""
echo "[2/6] 获取项目代码..."
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

if [ -d ".git" ]; then
    echo "更新现有代码..."
    git pull origin master
else
    echo "克隆新代码..."
    git clone https://github.com/CandideEgo/Speaking.git .
fi

echo "✓ 代码已就绪: $(git rev-parse --short HEAD)"

# 3. 配置环境变量
echo ""
echo "[3/6] 配置环境变量..."
cat > .env << 'EOF'
POSTGRES_USER=speaking
POSTGRES_PASSWORD=Speaking@2026Secure
POSTGRES_DB=speaking
DATABASE_URL=postgresql://speaking:Speaking@2026Secure@db:5432/speaking
SECRET_KEY=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
NEXT_PUBLIC_API_URL=http://47.122.109.52:8000
WHISPER_MODEL=base
EOF

echo "✓ .env 文件已创建"

# 4. 构建镜像
echo ""
echo "[4/6] 构建 Docker 镜像（这可能需要几分钟）..."
docker-compose -f docker-compose.prod.yml build --no-cache

echo "✓ 镜像构建完成"

# 5. 启动服务
echo ""
echo "[5/6] 启动服务..."
docker-compose -f docker-compose.prod.yml down || true
docker-compose -f docker-compose.prod.yml up -d

echo "✓ 服务已启动"

# 6. 等待并检查状态
echo ""
echo "[6/6] 检查服务状态..."
sleep 15

echo ""
echo "容器状态:"
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "最近日志:"
docker-compose -f docker-compose.prod.yml logs --tail=20

echo ""
echo "========================================="
echo "  部署完成！"
echo "========================================="
echo ""
echo "📊 查看服务状态: docker-compose -f docker-compose.prod.yml ps"
echo "📋 查看实时日志: docker-compose -f docker-compose.prod.yml logs -f"
echo "🔄 重启服务: docker-compose -f docker-compose.prod.yml restart"
echo "⏹️  停止服务: docker-compose -f docker-compose.prod.yml down"
echo ""
echo "🌐 访问地址: http://47.122.109.52"
echo ""
