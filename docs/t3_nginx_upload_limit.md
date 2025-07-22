# T3 워크플로우 업로드 파일 크기 제한 (Nginx)

---

## 배경

- n8n 워크플로우 내부에서 업로드 파일 크기 제한을 시도했으나:
  - Code 노드를 통과하면 binary Buffer가 깨져 Save to Temp File에서 undefined 오류 발생
  - 병렬 브랜치 방식도 Stop Execution이 이미 실행된 Save 노드를 멈추지 못함
- 결론적으로 **워크플로우 내부에서 파일 크기 제한은 구조상 비효율적**임

---

## 해결 전략

- **Nginx 리버스 프록시 레벨에서 업로드 크기를 제한**
- 50MB 초과 요청은 n8n까지 전달되지 않고 즉시 413 반환

---

## 적용 설정

`/etc/nginx/sites-enabled/n8nd`

```nginx
server {
    listen 443 ssl;
    server_name n8nd.giize.com;

    ssl_certificate /etc/letsencrypt/live/n8nd.giize.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n8nd.giize.com/privkey.pem;

    location / {
        client_max_body_size 50M;  # ✅ 업로드 제한 50MB
        proxy_pass http://localhost:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

적용 후:

``` shell
sudo nginx -t
sudo systemctl reload nginx

```

---

## 테스트 및 결과

cURL:
``` shell
# 335MB 파일 업로드 시
curl -X POST "https://n8nd.giize.com/webhook/docupload" -F file=@video.mjpg
```

결과:
``` html
<html>
<head><title>413 Request Entity Too Large</title></head>
<body>
<center><h1>413 Request Entity Too Large</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>
</body>
</html>

```

* 335MB 파일 업로드 시 Nginx가 즉시 413 Request Entity Too Large 반환
* n8n 워크플로우는 실행되지 않음 → 디스크/메모리 낭비 방지


---

## 결론

* 50MB 이하 파일만 n8n 워크플로우로 안전하게 전달
* 50MB 초과 파일은 Nginx 레벨에서 즉시 차단
* MVP에서는 Nginx 업로드 제한으로 충분하며, 워크플로우 내부 로직 수정 불필요
