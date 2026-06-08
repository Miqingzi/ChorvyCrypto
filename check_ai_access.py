# -*- coding: utf-8 -*-
import paramiko
import sys
import io

# 强制 stdout 用 utf-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '192.119.75.143'
port = 22
user = 'root'
password = 'Cg690851dMnucjPWYU'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, port=port, username=user, password=password,
               look_for_keys=False, allow_agent=False, timeout=15)

script_content = r"""#!/bin/bash
echo "=============================="
echo " VPS AI 服务连通性测试"
echo " 时间: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=============================="
echo ""

test_url() {
    local name="$1"
    local url="$2"
    printf "%-20s " "$name"
    local result=$(curl -sS --connect-timeout 8 --max-time 15 -o /dev/null \
        -w "HTTP:%{http_code} | %{time_total}s | %{remote_ip}" \
        "$url" 2>&1)
    if [ $? -ne 0 ]; then
        echo "[FAIL] 连接失败/超时"
    else
        echo "[OK]   $result"
    fi
}

echo "=== 海外 AI ==="
test_url "OpenAI" "https://api.openai.com"
test_url "ChatGPT" "https://chatgpt.com"
test_url "Claude API" "https://api.anthropic.com"
test_url "Claude Web" "https://claude.ai"
test_url "Gemini API" "https://generativelanguage.googleapis.com"
test_url "Gemini Web" "https://gemini.google.com"
test_url "DeepSeek" "https://api.deepseek.com"
test_url "DeepSeek Web" "https://chat.deepseek.com"
test_url "Groq" "https://api.groq.com"
test_url "Groq Console" "https://console.groq.com"
test_url "Perplexity" "https://www.perplexity.ai"
test_url "Cohere" "https://api.cohere.com"
test_url "Mistral" "https://api.mistral.ai"
test_url "HuggingFace" "https://huggingface.co"
test_url "Together AI" "https://api.together.xyz"
test_url "Fireworks" "https://api.fireworks.ai"
test_url "Replicate" "https://api.replicate.com"
test_url "GitHub" "https://github.com"
test_url "Cloudflare" "https://api.cloudflare.com"
echo ""
echo "=== 国内 AI ==="
test_url "百度文心" "https://aip.baidubce.com"
test_url "阿里通义" "https://dashscope.aliyuncs.com"
test_url "字节豆包" "https://ark.cn-beijing.volces.com"
test_url "智谱GLM" "https://open.bigmodel.cn"
test_url "月之暗面" "https://api.moonshot.cn"
test_url "零一万物" "https://api.lingyiwanwu.com"
test_url "MiniMax" "https://api.minimax.chat"
echo ""
echo "=== 基础服务 ==="
test_url "Google" "https://www.google.com"
test_url "YouTube" "https://www.youtube.com"
test_url "Cloudflare DNS" "https://1.1.1.1"
test_url "Google DNS" "https://8.8.8.8"
"""

stdin, stdout, stderr = client.exec_command('cat > /tmp/ai_test.sh && chmod +x /tmp/ai_test.sh')
stdin.write(script_content)
stdin.channel.shutdown_write()
stdout.read()

stdin2, stdout2, stderr2 = client.exec_command('bash /tmp/ai_test.sh 2>&1')
output = stdout2.read().decode('utf-8', errors='replace')

print("=" * 60)
print("  VPS (洛杉矶) 访问 AI 服务测试结果")
print("=" * 60)
print(output)

client.exec_command('rm -f /tmp/ai_test.sh')
client.close()
