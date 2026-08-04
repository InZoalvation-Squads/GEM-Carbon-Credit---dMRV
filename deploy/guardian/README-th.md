# คู่มือ Deploy Hedera Guardian บนเครื่อง 100.119.217.61

> เป้าหมาย: ให้ `https://guardian.makill.xyz` ใช้งานได้จริง เพื่อให้ Carbon Ready
> เชื่อม Phase 2 ตาม `docs/superpowers/specs/2026-07-22-guardian-api-migration-design.md`

## สิ่งที่ตรวจพบบนเครื่องปัจจุบัน (2026-07-22)

- nginx (443) มี vhost ชื่อ `guardian.makill.xyz` อยู่แล้ว แต่ติด Basic Auth และไม่มี Guardian อยู่ข้างหลัง
- พอร์ตที่ใช้ไปแล้ว: 3000 (เว็บ InZoalvation), 3001 (GEM Carbon Credit), 3002/3003 (Next.js), 5432 (Postgres), 8081
- DNS สาธารณะของ `guardian.makill.xyz` **ยังไม่มี A record** — ใช้ได้เฉพาะยิงตรง IP + SNI

ดังนั้นคู่มือนี้ใช้พอร์ต **3006** สำหรับ Guardian web-proxy เพื่อไม่ชนของเดิม

## ขั้นตอน (รันบนเครื่อง server)

### 1. เตรียมเครื่อง
```bash
# ต้องมี: Docker ≥ 24 + docker compose plugin, RAM ≥ 8GB ว่าง, disk ≥ 30GB
docker --version && docker compose version
```

### 2. Clone Guardian (pin release — อย่าใช้ main)
```bash
cd /opt
sudo git clone https://github.com/hashgraph/guardian.git
cd guardian
# เลือก release ล่าสุดที่เป็น stable tag จาก https://github.com/hashgraph/guardian/releases
sudo git checkout <ล่าสุด-stable-tag>
```

### 3. ตั้งค่า environment
Guardian อ่านค่าจาก `configs/.env.<GUARDIAN_ENV>.guardian.system`
(ดู `configs/.env.template.guardian.system` ของ release ที่เลือกประกอบ — ชื่อไฟล์/คีย์
อาจต่างกันเล็กน้อยตามเวอร์ชัน):

```bash
# ไฟล์ .env หลักที่รากโปรเจกต์
GUARDIAN_ENV=prod

# configs/.env.prod.guardian.system — ค่าสำคัญ:
OPERATOR_ID="0.0.9651712"
OPERATOR_KEY="<HEDERA_OPERATOR_KEY จาก carbon-ready/.env — ห้าม commit>"
HEDERA_NET="testnet"
PREUSED_HEDERA_NET="testnet"
# IPFS: ใช้ node ในตัว (local) เพื่อไม่ต้องพึ่ง web3.storage
IPFS_PROVIDER="local"
IPFS_NODE_ADDRESS="http://ipfs-node:5001"
```

หมายเหตุ: อย่าใช้ IPFS ที่พอร์ต 5001 ของเครื่อง dev — Guardian compose มี ipfs-node ของตัวเอง

### 4. เปลี่ยนพอร์ต web-proxy กันชนพอร์ตเดิม
ใน `docker-compose.yml` ของ Guardian แก้ service `web-proxy` ให้ map เป็น `3006:80`

### 5. รัน
```bash
sudo docker compose up -d --build     # ครั้งแรกใช้เวลานาน (build หลาย service)
sudo docker compose ps                # ทุกตัวต้อง healthy/running
curl -s http://localhost:3006/api/v1/settings/environment   # ต้องตอบ JSON
```

### 6. nginx: เลิก Basic Auth ของ vhost นี้ แล้ว proxy ไป Guardian
ใช้ไฟล์ `nginx-guardian.conf` ในโฟลเดอร์นี้แทน vhost เดิม:
```bash
sudo cp nginx-guardian.conf /etc/nginx/sites-available/guardian.makill.xyz
sudo ln -sf /etc/nginx/sites-available/guardian.makill.xyz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 7. DNS
เพิ่ม A record `guardian.makill.xyz → <public IP ของเครื่อง>` ที่ผู้ให้บริการโดเมน
หรือถ้าจะใช้เฉพาะใน Tailscale ให้ทุกเครื่อง dev เพิ่ม `/etc/hosts`:
```
100.119.217.61  guardian.makill.xyz
```

### 8. สร้าง Standard Registry ครั้งแรก
1. เปิด `https://guardian.makill.xyz` → สมัคร user แรกเป็น **Standard Registry**
   ด้วย username/password ที่ตั้งไว้ใน `carbon-ready/.env` (`GUARDIAN_SR_USERNAME/PASSWORD`)
2. กรอก Hedera credentials (OPERATOR_ID/KEY) ให้ SR profile แล้วรอ initialization จบ
   (Guardian จะสร้าง DID + topic บน testnet — ใช้ HBAR จาก operator)
3. Import policy ที่ต้องการ (Methodology Library ในตัว หรือไฟล์ .policy)
   แล้วเอา **policy id จริง** (Mongo ObjectId) มาแทนค่า `GUARDIAN_POLICY_ID=test-policy`
   ใน `carbon-ready/.env`

### 9. ทดสอบจากเครื่อง dev
```bash
curl -s -X POST https://guardian.makill.xyz/api/v1/accounts/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<SR user>","password":"<SR pass>"}'
# ต้องได้ JSON ที่มี refreshToken
```

## เช็คลิสต์ก่อนแจ้งว่าพร้อม
- [ ] `docker compose ps` เขียว/healthy ทุก service
- [ ] `https://guardian.makill.xyz/api/v1/accounts/login` ตอบ JSON (ไม่ใช่ 401 ของ nginx)
- [ ] SR สร้างเสร็จ + Hedera init จบ
- [ ] มี policy id จริงใส่กลับใน `carbon-ready/.env`
