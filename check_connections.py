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
    ("=== Sing-Box 配置文件 ===", "cat /etc/s-box/sb.json 2>/dev/null | head -100"),
    ("=== Hysteria 配置文件 ===", "cat /etc/hysteria/config.yaml 2>/dev/null | head -80"),
    ("=== Xray 配置文件 ===", "cat /etc/x-ui/x-ui.cfg 2>/dev/null; ls /etc/x-ui/ 2>/dev/null"),
    ("=== Sing-Box 日志(最近50行) ===", "journalctl -u sing-box --no-pager -n 50 2>/dev/null | tail -50"),
    ("=== Hysteria 日志(最近30行) ===", "journalctl -u hysteria-server --no-pager -n 30 2>/dev/null | tail -30"),
    ("=== 当前TCP连接(目标端口为代理端口) ===", "ss -tpn state established '( dport = :2052 or dport = :2096 or dport = :40426 or dport = :32465 or dport = :6677 or dport = :59960 or dport = :37696 or dport = :443 )' 2>/dev/null | head -60"),
    ("=== 当前所有ESTABLISHED连接(只看远端IP) ===", "ss -tn state established 2>/dev/null | tail -n +2 | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -40"),
    ("=== connection tracking (conntrack) ===", "conntrack -L -o extended 2>/dev/null | grep -E '(2052|2096|40426|32465|6677|443)' | head -40 || echo 'conntrack not available'"),
    ("=== nf_conntrack 原始数据 ===", "cat /proc/net/nf_conntrack 2>/dev/null | grep -E '(2052|2096|40426|32465|6677|443)' | head -30 || echo 'nf_conntrack not available'"),
    ("=== 最近5分钟连接的IP(to含代理端口) ===", "if [ -f /proc/net/nf_conntrack ]; then cat /proc/net/nf_conntrack | grep -E 'dport=(2052|2096|40426|32465|6677|443|59960|37696)' | awk '{for(i=1;i<=NF;i++){if(\$i ~ /src=/){print \$i}}}' | sort | uniq -c | sort -rn | head -30; else ss -tn state established 2>/dev/null | awk '{print \$5}' | sort | uniq -c | sort -rn | head -30; fi"),
    ("=== 看看x-ui的配置路径 ===", "ls -la /usr/local/x-ui/bin/ 2>/dev/null | head -10"),
    ("=== 查看x-ui的数据库配置 ===", "find /etc -name 'config.json' -o -name 'x-ui.db' 2>/dev/null | grep x-ui | head -10"),
]

for title, cmd in commands:
    print(f"\n{title}")
    print("-" * 60)
    try:
        stdin, stdout, stderr = client.exec_command(cmd, timeout=20)
        out = stdout.read().decode('utf-8', errors='replace').strip()
        err = stderr.read().decode('utf-8', errors='replace').strip()
        if out:
            print(out[:3000])
        if err:
            print(f"[ERR] {err[:300]}")
    except:
        print("[TIMEOUT]")

client.close()
