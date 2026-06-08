# -*- coding: utf-8 -*-
import paramiko
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '192.119.75.143'
port = 22
user = 'root'
password = 'Cg690851dMnucjPWYU'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, port=port, username=user, password=password,
               look_for_keys=False, allow_agent=False, timeout=15)

commands = [
    ("=== 所有进程概览 (ps aux) ===", "ps aux --sort=-%mem | head -40"),
    ("=== 运行中的服务 (systemctl list-units) ===", "systemctl list-units --type=service --state=running --no-pager 2>/dev/null | head -30"),
    ("=== 网络监听端口 ===", "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null"),
    ("=== Docker 容器(如有) ===", "docker ps 2>/dev/null || echo 'Docker not installed'"),
    ("=== crontab 定时任务 ===", "crontab -l 2>/dev/null || echo 'No crontab'"),
    ("=== 系统负载/运行时间 ===", "uptime && free -h"),
]

for title, cmd in commands:
    print(f"\n{title}")
    print("-" * 60)
    stdin, stdout, stderr = client.exec_command(cmd, timeout=15)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        print(out)
    if err:
        print(f"[ERR] {err}")

client.close()
