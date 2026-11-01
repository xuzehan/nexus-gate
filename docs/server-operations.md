# NexusGate 服务器运维手册

> 适用环境：Debian 13（Trixie），NexusGate 控制台与关联项目。
>
> 最后更新：2026-11-01

本文档只记录部署结构、运维流程和公开访问方式。服务器密码、JWT 密钥、数据库密码、
Navidrome 密码、SMTP 授权码、登录 Cookie 和私钥不得写入 Git 仓库。

## 1. 公开入口

| 服务 | 地址 |
| --- | --- |
| NexusGate 前端 | `https://xuzehan.github.io/nexus-gate/` |
| NexusGate 工作台 | `https://xuzehan.github.io/nexus-gate/dashboard.html` |
| 聚合 API | `https://api.u4162692.nyat.app:36744` |
| 连结之音 Web/PWA | `https://api.u4162692.nyat.app:36744/music/` |
| 连结之音 API 文档 | `https://api.u4162692.nyat.app:36744/api/music/docs` |

前端部署在 GitHub Pages，API、音乐 Web 和媒体流通过 Sakura 隧道进入服务器
Nginx。不要把服务器 IP、SSH 密码或密钥写入公开文档。

## 2. 服务拓扑

```text
Browser / Android
  |
  +-- GitHub Pages: NexusGate Web
  |
  +-- HTTPS:36744 -> Sakura FRP -> Nginx 127.0.0.1:8080
                                  |
                                  +-- /             -> /var/www/music
                                  +-- /api/music/   -> 127.0.0.1:8002
                                  +-- /api/mhdees/  -> 127.0.0.1:8001
                                  +-- /api/         -> 127.0.0.1:8000

music-api 127.0.0.1:8002
  +-- Navidrome 127.0.0.1:4533
  +-- go-music-api 127.0.0.1:18080
```

## 3. 服务与端口

| 服务 | 运行方式 | 监听地址 | 主要目录 |
| --- | --- | --- | --- |
| NexusGate API | systemd `nexusgate-api` | `127.0.0.1:8000` | `/root/nexus_backend` |
| MHD-EES API | systemd `nexus-mhdees-api` | `127.0.0.1:8001` | 独立 API 项目目录 |
| NexusMusic API | systemd `music-api` | `127.0.0.1:8002` | `/root/music_api` |
| Nginx | systemd `nginx` | `127.0.0.1:8080` | `/etc/nginx/sites-available/nexus-api` |
| Navidrome | Docker `navidrome` | `4533` | `/data/music`、`/data/navidrome` |
| go-music-api | Docker `go-music-api` | `127.0.0.1:18080` | `/data/go-music-api` |
| MySQL | Docker `mysql8` | 仅内网使用 | 由 NexusGate 配置管理 |
| Kafka | Docker `kafka` | 仅内网使用 | `/data` 下持久化 |
| Doris | Docker `doris-allinone` | 仅内网使用 | `/data` 下持久化 |
| Flink | Docker `flink-jobmanager` | 仅内网使用 | `/data` 下持久化 |
| Sakura FRP | Docker `sakura-frp` | 隧道入口 | 无独立配置目录 |

`.env`、数据库密码、Navidrome 密码和 go-music-api Cookie 只保存在服务器，
文件权限应保持 `600`。

## 4. Nginx 路由

生产配置：

```text
/etc/nginx/sites-available/nexus-api
```

仓库中的完整参考配置：

```text
server_music_backend/deploy/nexus-api-with-music-app.conf
```

关键规则：

```nginx
server {
    listen 127.0.0.1:8080;
    absolute_redirect off;

    location = /music {
        return 301 /music/;
    }

    location /music/ {
        root /var/www;
        try_files $uri $uri/ /music/index.html;
        add_header Cache-Control "no-cache";
    }

    location = /music/manifest.webmanifest {
        root /var/www;
        default_type application/manifest+json;
        try_files $uri =404;
    }

    location ~* ^/music/assets/ {
        root /var/www;
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /api/mhdees/ {
        proxy_pass http://127.0.0.1:8001;
    }

    location /api/music/ {
        proxy_pass http://127.0.0.1:8002;
        proxy_http_version 1.1;
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;
        proxy_force_ranges on;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_hide_header Accept-Ranges;
        add_header Accept-Ranges bytes always;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
    }
}
```

实际配置还需要保留 Host、X-Real-IP、X-Forwarded-For 和 X-Forwarded-Proto
请求头。修改后必须执行：

```bash
nginx -t
systemctl reload nginx
```

回滚：

```bash
cp /root/nexus_music_backups/<backup-file>.conf \
  /etc/nginx/sites-available/nexus-api
nginx -t
systemctl reload nginx
```

## 5. NexusGate 与 MHD-EES

NexusGate API 只监听回环地址，由 Nginx 和 Sakura 对外提供入口。

```bash
systemctl status nexusgate-api --no-pager
systemctl status nexus-mhdees-api --no-pager
journalctl -u nexusgate-api -n 100 --no-pager
journalctl -u nexus-mhdees-api -n 100 --no-pager
```

健康检查：

```bash
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8001/api/mhdees/health
```

前端发布：

1. 修改 `nexus_gate_web/`。
2. 确认 `config.js` 中的 API 地址正确。
3. 将前端文件提交到 GitHub 仓库 `main` 分支。
4. 等待 GitHub Pages 部署完成。
5. 使用无缓存查询验证 HTML、配置和脚本均已更新。

## 6. 连结之音 API

公网与内网访问必须统一经过 `music-api`，App 不直接连接 Navidrome 或
go-music-api。

接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/music/health` | 健康检查 |
| GET | `/api/music/search?q=关键词` | 本地优先搜索 |
| GET | `/api/music/stream` | 本地/外部音频流 |
| POST | `/api/music/favorite` | 收藏并下载到服务器曲库 |
| GET | `/api/music/favorite/{job_id}` | 查询下载任务 |
| GET | `/api/music/docs` | Swagger |

### 搜索规则

1. 先搜索 Navidrome 本地曲库。
2. 只要本地有结果，就直接返回本地结果，不再请求外部音源。
3. 本地没有结果时，才调用 go-music-api。
4. 外部搜索失败时返回 HTTP 200、空结果和可读 `error`。

当前没有持久化的用户音频缓存。浏览器或 WebView 只会在播放时临时缓冲；
只有用户执行“存入曲库”后，外部歌曲才会下载到服务器 `/data/music`。

### 音频流

本地：

```text
GET /api/music/stream?origin=local&navidrome_id=<id>
```

外部：

```text
GET /api/music/stream?origin=external&external_id=<id>&source=<source>
```

拖动进度时必须得到 `206 Partial Content`，并包含：

```text
Accept-Ranges: bytes
Content-Range: bytes 0-1023/<total>
```

如果外部流返回 `404` 和 `{"detail":"Failed to get URL"}`，通常是外部歌曲 ID
失效、版权限制、登录 Cookie 失效或上游音源暂时不可用。重新搜索并选择新结果；
仍有问题时检查 `music-api` 和 `go-music-api` 日志。

### Bilibili 音源

当前 go-music-api 支持 `source=bilibili`，其流接口也已验证支持 HTTP Range。
但 NexusMusic 的聚合搜索目前没有显式请求 B 站源，因此普通搜索结果中不保证出现
B 站资源。若需要稳定展示，需要给外部搜索客户端增加 B 站独立搜索与结果合并。

go-music-api 的部分音源需要登录 Cookie。Cookie 必须在服务器上单独保存，禁止
提交到 Git。B 站结果通常是视频或合集音频，元数据和可用性取决于视频公开状态。

## 7. 连结之音 Web/PWA 发布

构建目录：

```text
NexusMusic/app/
```

构建：

```powershell
npm ci
npm run build
```

生成的静态目录为 `app/dist/`。发布到服务器：

```bash
ssh root@<server-address> "mkdir -p /var/www/music"
scp NexusMusic-web-<version>.zip root@<server-address>:/tmp/nexusmusic-web.zip
ssh root@<server-address> \
  "python3 -m zipfile -e /tmp/nexusmusic-web.zip /var/www/music"
ssh root@<server-address> \
  "chmod -R u=rwX,go=rX /var/www/music"
```

服务器没有 `unzip` 时必须使用 Python 的 `zipfile` 模块。旧版本带哈希的静态文件
不会造成冲突，可在确认新版本稳定后清理。

验证：

```bash
curl -I http://127.0.0.1:8080/music/
curl -I http://127.0.0.1:8080/music/manifest.webmanifest
curl -I http://127.0.0.1:8080/music/assets/<asset-file>.js
```

预期：

- HTML 和 manifest 使用 `no-cache`。
- 带哈希的 JS/CSS 使用长期缓存。
- manifest 的 Content-Type 为 `application/manifest+json`。

Android 构建：

```powershell
$env:ANDROID_HOME = "<Android SDK path>"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
cd NexusMusic/app
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

输出文件：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

当前自用包使用 Android Debug 证书签名，不等同于应用商店发布签名。

## 8. Navidrome 与 go-music-api

```bash
cd /data/navidrome
docker compose ps
docker compose restart

cd /data/go-music-api
docker compose ps
docker compose restart
```

查看日志：

```bash
docker logs --tail 100 navidrome
docker logs --tail 100 go-music-api
```

Navidrome：

- 音乐目录：`/data/music`
- 数据目录：`/data/navidrome/data`
- 扫描周期：`1h`
- 新下载文件完成后会触发扫描

go-music-api：

- Swagger：服务器内 `http://127.0.0.1:18080/swagger/index.html`
- 只绑定回环地址，不直接对公网开放
- 当前镜像支持 `netease`、`qq`、`kugou`、`kuwo`、`bilibili`、`soda`、
  `migu`、`fivesing` 等来源

## 9. 健康检查和排障

完整检查：

```bash
systemctl is-active nexusgate-api nexus-mhdees-api music-api nginx
docker ps --format '{{.Names}} {{.Status}}' | sort
ss -lntp | grep -E ':(8000|8001|8002|8080|4533|18080)\b'
```

服务日志：

```bash
journalctl -u music-api -n 100 --no-pager
journalctl -u nexusgate-api -n 100 --no-pager
journalctl -u nginx -n 100 --no-pager
docker logs --tail 100 go-music-api
docker logs --tail 100 navidrome
```

公网检查：

```bash
curl -fsS https://api.u4162692.nyat.app:36744/api/health
curl -fsS https://api.u4162692.nyat.app:36744/api/mhdees/health
curl -fsS https://api.u4162692.nyat.app:36744/api/music/health
curl -fsS https://api.u4162692.nyat.app:36744/music/
```

常见问题：

| 现象 | 排查方向 |
| --- | --- |
| 公网 API 404 | Sakura 隧道是否转发到 `127.0.0.1:8080` |
| `/music/` 404 | `/var/www/music/index.html` 是否存在 |
| manifest 类型错误 | Nginx `default_type application/manifest+json` |
| 拖动播放失败 | Nginx/上游是否透传 Range，是否返回 206 |
| 外部流 404 | 歌曲 ID 过期、来源不可用或 Cookie 失效 |
| 音乐已下载但搜不到 | 等待 Navidrome 扫描或手动触发扫描 |
| GitHub Pages 仍是旧页面 | 确认提交已推送并等待 Pages 部署 |

## 10. 备份与安全基线

修改 Nginx、systemd 或生产配置前先备份：

```bash
install -d -m 700 /root/nexus_music_backups
cp /etc/nginx/sites-available/nexus-api \
  /root/nexus_music_backups/nexus-api-$(date +%Y%m%d-%H%M%S).conf
```

安全要求：

- 不把 `.env`、数据库密码、JWT 密钥、SMTP 授权码或 Cookie 提交到 Git。
- 不在公开文档中记录 root 密码、私钥或精确内部网络地址。
- API 默认只监听 `127.0.0.1`，由 Nginx 统一暴露。
- NexusGate 登录令牌不得写入服务器访问日志。
- 发布前执行 `nginx -t`，发布后验证健康检查和媒体 Range。
- 定期确认 `/data` 容量、Navidrome 扫描状态和 Sakura 隧道在线状态。
