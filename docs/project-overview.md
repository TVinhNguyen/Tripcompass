# TripCompass - Tong quan ngan

## Backend lam duoc gi

- Cung cap REST API cho xac thuc, nguoi dung, dia diem, lich trinh va AI chat.
- Quan ly dang ky, dang nhap, JWT, Google OAuth va xac thuc email qua Resend.
- Xu ly du lieu lich trinh, dia diem, nha hang, tim kiem va goi planner AI khi can.
- Ho tro realtime/collaboration qua WebSocket va cache/trang thai qua Redis.

## Frontend lam duoc gi

- Hien thi giao dien web TripCompass bang Next.js.
- Cho phep nguoi dung dang ky, dang nhap, xem dia diem, lap lich trinh va quan ly itinerary.
- Co man hinh AI Planner de chat/lap ke hoach du lich voi AI.
- Ket noi API backend, WebSocket va planner service de cap nhat du lieu.

## Cong nghe backend

- Go, Gin, GORM, JWT, WebSocket.
- PostgreSQL driver, Redis client, Resend email API.
- Docker/Docker Compose cho moi truong dev va prod.

## Cong nghe frontend

- Next.js, React, TypeScript.
- Tailwind CSS, Radix UI, shadcn-style components.
- React Hook Form, Zod, Leaflet, Framer Motion.

## Database va ha tang

- PostgreSQL 16: luu users, places, itineraries va du lieu nghiep vu.
- Redis 7: cache, trang thai phien va ho tro cac tac vu realtime/AI.
- Planner AI: Python, FastAPI, LangGraph, LangChain.
- CI/CD: GitHub Actions, Docker Hub, Docker Compose production.
