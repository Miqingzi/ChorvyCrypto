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
    # 1. 从 sing-box 日志中提取所有连接的 IP 和访问的网站
    ("=== Sing-Box 日志中连接用户IP汇总 ===",
     '''journalctl -u sing-box --no-pager 2>/dev/null | grep -oP 'inbound connection from \\[[^]]+\\]:\\d+|inbound connection from \\d+\\.\\d+\\.\\d+\\.\\d+:\\d+' | grep -oP '\\[[^]]+\\]|\\d+\\.\\d+\\.\\d+\\.\\d+' | sort | uniq -c | sort -rn | head -30'''),

    # 2. 从 sing-box 日志中提取访问的目标网站
    ("=== Sing-Box 日志中访问的目标网站TOP20 ===",
     '''journalctl -u sing-box --no-pager 2>/dev/null | grep 'inbound connection to ' | grep -oP 'inbound connection to \\K[^:]+' | sort | uniq -c | sort -rn | head -20'''),

    # 3. 实时连接抓取 - 看出口连接的目标
    ("=== Sing-Box 当前出站连接的IP和域名 ===",
     '''ss -tnp state established 2>/dev/null | grep 'sing-box' && ss -tnp state established 2>/dev/null | awk '{print $5}' | grep -v 'Peer' | cut -d: -f1 | sort | uniq -c | sort -rn | head -20'''),

    # 4. 查看所有 nf_conntrack 中的出站连接(正在访问的网站IP)
    ("=== conntrack 出站连接目标IP汇总 ===",
     '''cat /proc/net/nf_conntrack 2>/dev/null | grep 'src=192.119.75.143' | grep 'dport=443' | grep -oP 'dst=\\K[^ ]+' | sort | uniq -c | sort -rn | head -30'''),

    # 5. DNS 查询记录 (sing-box 解析了哪些域名)
    ("=== Sing-Box DNS 查询记录 ===",
     '''journalctl -u sing-box --no-pager 2>/dev/null | grep -i 'dns\\|resolve\\|lookup' | grep -oP '(?:resolve|lookup) \\K[^ :]+' | sort | uniq -c | sort -rn | head -20'''),

    # 6. 全部日志中访问的域名 (inbound connection to)
    ("=== 最近24小时内访问的完整域名列表 ===",
     '''journalctl -u sing-box -S "24 hours ago" --no-pager 2>/dev/null | grep 'inbound connection to ' | grep -oP 'inbound connection to \\K\\S+' | sed 's/:[0-9]*$//' | sort | uniq -c | sort -rn | head -30'''),

    # 7. hysteria 的连接日志
    ("=== Hysteria 连接日志 ===",
     '''journalctl -u hysteria-server -S "24 hours ago" --no-pager 2>/dev/null | grep -i 'connect\\|session\\|peer\\|addr' | head -30'''),

    # 8. x-ui 数据库连接记录
    ("=== X-UI 数据库中的客户端连接统计 ===",
     '''sqlite3 /etc/x-ui/x-ui.db "SELECT client_email, total_flow, enable FROM client_traffics ORDER BY total_flow DESC LIMIT 20;" 2>/dev/null || echo "SQLite query failed"'''),

    # 9. x-ui 数据库节点信息
    ("=== X-UI 数据库节点列表 ===",
     '''sqlite3 /etc/x-ui/x-ui.db "SELECT id, remark, port, protocol, enable FROM inbounds LIMIT 20;" 2>/dev/null || echo "SQLite query failed"'''),

    # 10. 从 sing-box 连接日志中提取用户IP和访问的配对
    ("=== 用户IP -> 访问网站 配对(最近日志) ===",
     '''journalctl -u sing-box --no-pager 2>/dev/null | grep 'inbound connection from ' | tail -100 | awk '
/inbound connection from / {
    match($0, /from \[?([0-9a-fA-F:.]+)\]?:[0-9]+/, a)
    if (a[1] != "") ip = a[1]
}
/inbound connection to / {
    match($0, /inbound connection to ([^ ]+)/, b)
    if (b[1] != "" && ip != "") print ip " -> " b[1]
}
/inbound connection from [0-9]/ {
    match($0, /from ([0-9.]+):[0-9]+/, a)
    if (a[1] != "") ip = a[1]
}' | sort | uniq -c | sort -rn | head -30'''),
]

for i, (title, cmd) in enumerate(commands, 1):
    print(f"\n\n{'='*60}")
    print(f"  [{i}] {title}")
    print('='*60)
    try:
        stdin, stdout, stderr = client.exec_command(cmd, timeout=30)
        out = stdout.read().decode('utf-8', errors='replace').strip()
        err = stderr.read().decode('utf-8', errors='replace').strip()
        if out:
            print(out[:4000])
        if err:
            print(f"[ERR] {err[:500]}")
        if not out and not err:
            print("(无数据)")
    except Exception as e:
        print(f"[ERROR] {e}")

client.close()
