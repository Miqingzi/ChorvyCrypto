import paramiko

host = '192.119.75.143'
port = 22
user = 'root'
password = 'Cg690851dMnucjPWYU'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, port=port, username=user, password=password,
               look_for_keys=False, allow_agent=False, timeout=15)

commands = [
    'echo ===== RESOURCES =====',
    'free -h',
    'echo ---',
    'df -h',
    'echo ---',
    'uptime',
    'echo ---',
    'nproc',
    'echo ===== DOCKER =====',
    'docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null',
    'echo ===== DOCKER COMPOSE =====',
    'find / -maxdepth 4 -name "docker-compose.yml" -o -name "compose.yml" 2>/dev/null',
    'echo ===== SERVICES =====',
    'systemctl list-units --type=service --state=running --no-pager 2>/dev/null | head -30',
    'echo ===== NGINX/OPENRESTY =====',
    'ls /etc/nginx/sites-enabled/ 2>/dev/null; ls /usr/local/openresty/nginx/conf/vhost/ 2>/dev/null',
    'echo ======= PORTS =====',
    'ss -tlnp 2>/dev/null',
    'echo ===== CPU INFO =====',
    'lscpu 2>/dev/null | grep -E "Model name|CPU\(s\)|Thread|Core"',
    'echo ===== DISK USAGE BY DIR =====',
    'du -sh /* 2>/dev/null | sort -rh | head -15',
]

for cmd in commands:
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    if out:
        print(out)

client.close()
