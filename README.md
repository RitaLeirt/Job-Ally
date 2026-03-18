# Job AIly — AI简历优化工具

> 上传简历 → 输入目标JD → 逐模块AI优化 → 导出Word

---

## 文件清单

```
Job/
├── app.py          # 后端服务器（Flask）
├── app.js          # 前端逻辑
├── index.html      # 页面结构
├── styles.css      # 样式
├── requirements.txt
└── README.md
```

---

## 本地运行（日常使用）

### 第一步：安装依赖（只需一次）

```bash
pip install flask flask-cors requests
```

### 第二步：启动服务器

**Mac / Linux：**
```bash
cd ~/Downloads/Job
export AI_API_KEY=sk-你的千问Key
python app.py
```

**Windows（PowerShell）：**
```powershell
cd ~/Downloads/Job
$env:AI_API_KEY="sk-你的千问Key"
python app.py
```

启动成功后终端显示：
```
  AI:      OK -> qwen-plus
  URL:     http://localhost:3000
```

### 第三步：打开浏览器访问

```
http://localhost:3000
```

> ⚠️ 不能直接双击 index.html，必须通过 localhost:3000 访问

### 关闭服务器

终端按 `Ctrl+C`

---

## 云服务器部署（让别人也能访问）

### 环境要求

- Python 3.9+
- 公网服务器（阿里云/腾讯云等）
- 推荐系统：Ubuntu 22.04

### 步骤

**1. 上传文件到服务器**

```bash
scp -r ./Job user@你的服务器IP:/home/user/jobaily
```

**2. 安装依赖**

```bash
pip install flask flask-cors requests gunicorn
```

**3. 配置 API Key（永久生效）**

```bash
echo 'export AI_API_KEY=sk-你的千问Key' >> ~/.bashrc
source ~/.bashrc
```

**4. 测试启动**

```bash
cd /home/user/jobaily
python app.py
```

**5. 用 systemd 后台运行（生产环境）**

```bash
sudo nano /etc/systemd/system/jobaily.service
```

写入以下内容：

```ini
[Unit]
Description=Job AIly
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/jobaily
Environment="AI_API_KEY=sk-你的千问Key"
ExecStart=/usr/bin/python3 /home/ubuntu/jobaily/app.py
Restart=always

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable jobaily
sudo systemctl start jobaily
sudo systemctl status jobaily   # 查看状态
```

**6. 配置 Nginx 反向代理（可选，绑定域名）**

```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/jobaily
```

写入：

```nginx
server {
    listen 80;
    server_name 你的域名.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/jobaily /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 环境变量说明

| 变量名 | 必填 | 说明 | 默认值 |
|--------|------|------|--------|
| `AI_API_KEY` | ✅ | 通义千问 API Key | 无 |
| `AI_BASE_URL` | 否 | API 地址 | `dashscope.aliyuncs.com/...` |
| `AI_MODEL` | 否 | 模型名称 | `qwen-plus` |
| `MINERU_TOKEN` | 否 | MinerU PDF解析Token | 无 |
| `RATE_LIMIT` | 否 | 每IP每分钟最大请求数 | `10` |

---

## 获取 API Key

1. 访问 [阿里云百炼控制台](https://dashscope.console.aliyun.com/apiKey)
2. 登录后点击「创建 API-KEY」
3. 复制 `sk-` 开头的 Key

> ⚠️ API Key 是私密信息，不要分享给他人，不要上传到 GitHub

---

## 常见问题

**Q：右上角显示"本地模式"？**
A：没有设置 `AI_API_KEY`，或者直接双击打开了 index.html。按照上面步骤重新启动。

**Q：启动报错 `Address already in use`？**
A：3000端口被占用，先执行 `kill $(lsof -ti:3000)` 释放端口。

**Q：上传 PDF 解析效果差？**
A：注册 [MinerU](https://mineru.net) 获取 Token，设置 `MINERU_TOKEN` 环境变量可大幅提升解析质量。
