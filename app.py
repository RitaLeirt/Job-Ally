#!/usr/bin/env python3
"""
Job AIly — Flask Backend v3.1
API keys stored server-side only (env vars), never exposed to frontend.

Environment variables:
  AI_API_KEY      Your AI provider API key (required)
  AI_BASE_URL     API base URL (default: DashScope/Qwen compatible endpoint)
  AI_MODEL        Model name (default: qwen-plus)
  MINERU_TOKEN    MinerU cloud API token (optional)
  RATE_LIMIT      Max AI requests per IP per minute (default: 10)

Run:
  AI_API_KEY=sk-xxx python app.py
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
import os
import time
from collections import defaultdict
from threading import Lock

app = Flask(__name__, static_folder='.')
CORS(app)

# Server-side secrets — NEVER sent to frontend
AI_API_KEY   = os.environ.get('AI_API_KEY', '')
AI_BASE_URL  = os.environ.get('AI_BASE_URL',
               'https://dashscope.aliyuncs.com/compatible-mode/v1').rstrip('/')
AI_MODEL     = os.environ.get('AI_MODEL', 'qwen-plus')
MINERU_TOKEN = os.environ.get('MINERU_TOKEN', '')
MINERU_BASE  = 'https://mineru.net/api/v4'
RATE_LIMIT   = int(os.environ.get('RATE_LIMIT', '10'))

# Simple in-memory rate limiter
_rate_data = defaultdict(list)
_rate_lock = Lock()

def _check_rate(ip):
    now = time.time()
    with _rate_lock:
        _rate_data[ip] = [t for t in _rate_data[ip] if now - t < 60]
        if len(_rate_data[ip]) >= RATE_LIMIT:
            return False
        _rate_data[ip].append(now)
        return True

def _client_ip():
    return request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown').split(',')[0].strip()

def _ai_headers():
    return {'Authorization': f'Bearer {AI_API_KEY}', 'Content-Type': 'application/json'}

def _mineru_headers():
    return {'Authorization': f'Bearer {MINERU_TOKEN}', 'Content-Type': 'application/json'}


# Static file serving
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    blocked_ext  = {'.py', '.env', '.sh', '.cfg', '.ini', '.log', '.sqlite', '.db'}
    blocked_name = {'requirements.txt', '.env.example', 'README.md', 'Makefile'}
    ext = os.path.splitext(filename)[1].lower()
    if ext in blocked_ext or filename in blocked_name:
        return jsonify({'error': 'Forbidden'}), 403
    if os.path.isfile(filename):
        return send_from_directory('.', filename)
    return jsonify({'error': 'Not found'}), 404


# Health check
@app.route('/api/health')
def health():
    return jsonify({
        'status': 'ok',
        'version': '3.1.0',
        'ai_ready': bool(AI_API_KEY),
        'mineru_ready': bool(MINERU_TOKEN),
        'model': AI_MODEL if AI_API_KEY else ''
    })


# AI Chat
@app.route('/api/ai_chat', methods=['POST'])
def ai_chat():
    if not AI_API_KEY:
        return jsonify({'error': {'message': '服务器AI未配置，请联系管理员设置 AI_API_KEY'}}), 503

    ip = _client_ip()
    if not _check_rate(ip):
        return jsonify({'error': {'message': f'请求过于频繁，请稍后重试（每分钟限 {RATE_LIMIT} 次）'}}), 429

    data        = request.get_json(silent=True) or {}
    messages    = data.get('messages', [])
    temperature = float(data.get('temperature', 0.7))
    max_tokens  = min(int(data.get('max_tokens', 1500)), 4000)

    if not messages:
        return jsonify({'error': {'message': 'messages 不能为空'}}), 400

    try:
        resp = requests.post(
            f'{AI_BASE_URL}/chat/completions',
            headers=_ai_headers(),
            json={'model': AI_MODEL, 'messages': messages,
                  'temperature': temperature, 'max_tokens': max_tokens},
            timeout=90
        )
        body = resp.json()
        if resp.status_code != 200:
            msg = body.get('error', {}).get('message') or body.get('message') or str(body)
            return jsonify({'error': {'message': f'AI服务错误: {msg}'}}), resp.status_code
        return jsonify(body), 200

    except requests.Timeout:
        return jsonify({'error': {'message': 'AI请求超时（90s），请重试'}}), 504
    except requests.ConnectionError:
        return jsonify({'error': {'message': '无法连接AI服务，请检查网络'}}), 502
    except Exception as e:
        return jsonify({'error': {'message': str(e)}}), 500


# MinerU endpoints
@app.route('/api/mineru/upload_url', methods=['POST'])
def mineru_upload_url():
    if not MINERU_TOKEN:
        return jsonify({'code': -1, 'msg': 'MinerU not configured'}), 503
    try:
        r = requests.post(f'{MINERU_BASE}/file-urls/batch',
                          headers=_mineru_headers(),
                          json=request.get_json(silent=True) or {}, timeout=30)
        return jsonify(r.json()), r.status_code
    except Exception as e:
        return jsonify({'code': -1, 'msg': str(e)}), 500

@app.route('/api/mineru/create_task', methods=['POST'])
def mineru_create_task():
    if not MINERU_TOKEN:
        return jsonify({'code': -1, 'msg': 'MinerU not configured'}), 503
    try:
        r = requests.post(f'{MINERU_BASE}/extract/task',
                          headers=_mineru_headers(),
                          json=request.get_json(silent=True) or {}, timeout=30)
        return jsonify(r.json()), r.status_code
    except Exception as e:
        return jsonify({'code': -1, 'msg': str(e)}), 500

@app.route('/api/mineru/task/<task_id>')
def mineru_task_result(task_id):
    if not MINERU_TOKEN:
        return jsonify({'code': -1, 'msg': 'MinerU not configured'}), 503
    try:
        r = requests.get(f'{MINERU_BASE}/extract/task?task_id={task_id}',
                         headers=_mineru_headers(), timeout=30)
        return jsonify(r.json()), r.status_code
    except Exception as e:
        return jsonify({'code': -1, 'msg': str(e)}), 500


if __name__ == '__main__':
    print('\n' + '=' * 58)
    print('  Job AIly v3.1  —  AI简历合伙人')
    print(f'  AI:      {"OK -> " + AI_MODEL if AI_API_KEY else "NOT SET  (export AI_API_KEY=sk-xxx)"}')
    print(f'  Provider: {AI_BASE_URL}')
    print(f'  MinerU:  {"OK" if MINERU_TOKEN else "not set (optional)"}')
    print(f'  Rate:    {RATE_LIMIT} req/min per IP')
    print(f'  URL:     http://localhost:3000')
    print('=' * 58 + '\n')
    app.run(host='0.0.0.0', port=3000, debug=False)
