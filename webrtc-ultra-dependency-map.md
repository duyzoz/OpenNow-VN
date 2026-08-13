# WebRTC Ultra — dependency map NativeStream

## Kết luận chính

NativeStream không chỉ là thư mục Rust. Nó được nối vào main process qua `signalingCoordinator`, `NativeStreamerManager`, IPC handlers, runtime discovery/cache, packaging extraResources và các contract shared. Vì vậy không thể xóa thư mục native trước rồi mới sửa TypeScript.

WebRTC media/input path hiện có trong renderer vẫn là đường mặc định. `AGENTS.md` xác nhận Rust streamer là optional/Windows-focused và embedded Chromium WebRTC là default path.

## Các cụm cần xử lý

| Cụm | Vị trí | Hành động Ultra |
|---|---|---|
| Native manager | `opennow-stable/src/main/nativeStreamer/*` | Xóa sau khi loại toàn bộ import/callback; các test riêng cũng xóa hoặc thay bằng test WebRTC. |
| Signaling coordinator | `opennow-stable/src/main/signaling/signalingCoordinator.ts` | Bỏ native manager, native offer/ICE/input/surface branches; giữ WebRTC signaling. |
| Main startup/reset | `src/main/index.ts`, `src/main/ipc/coreHandlers.ts` | Bỏ warm/stop/reset native calls. |
| Renderer App | `src/renderer/src/App.tsx` và hooks | Xóa native session/transport selection; giữ StreamView, WebRTC stats, pointer lock và menu navigation. |
| Shared contracts | `src/shared/nativeStreamer.ts`, `src/shared/gfn/signaling.ts`, `src/shared/gfn/session.ts`, `settings.ts`, `api.ts` | Rút các type/action NVST; giữ shared stream settings cần cho WebRTC. |
| Packaging | `package.json`, `scripts/build-native-streamer.mjs`, `scripts/bundle-gstreamer-runtime.mjs`, `electron-builder` extraResources | Xóa native build khỏi `dist`; không bundle `native/opennow-streamer/bin` và GStreamer runtime nữa. |
| Rust | `native/opennow-streamer/**` | Xóa sau khi TypeScript/main đã không còn tham chiếu; commit xóa phải tách riêng để dễ rollback. |
| Localization | `locales/*.json` | Xóa/chuyển các key NativeStreamer/GStreamer/NVST sau khi UI không còn dùng. |

## Phạm vi an toàn đề xuất

Giai đoạn đầu không xóa ngay toàn bộ native. Trước hết đưa transport mode về WebRTC-only, loại mọi đường gọi native khỏi runtime và packaging, rồi chạy typecheck/build/test. Chỉ sau khi không còn import/runtime reference mới xóa Rust source, binary GStreamer và test native. Cách này làm giảm rủi ro build hỏng và giúp commit rollback được.

## WebRTC Ultra phải cải tiến gì

Ultra không thay thế WebRTC bằng giao thức mới ngay. Nó là WebRTC-only execution path với input policy riêng: mouse motion unordered/partial-reliable và coalesced theo live edge; keyboard/click/gamepad reliable; không có RawInput toàn cục; pointer lock có Escape/blur/Quick Menu escape; không queue cũ hơn một ngưỡng tuổi.

Video Ultra cần giữ requestVideoFrameCallback generation guard, dùng stats để đo decode-to-present/render FPS/frames dropped/jitter/loss, ưu tiên frame mới nhất và tránh React re-render theo từng packet. Cần kiểm tra codec/capability trước khi chọn profile; không thay hiệu ứng UI.

## Tiêu chí không được vi phạm

Không để mouse 1000 Hz làm nghẽn data channel hoặc main thread. Không thêm GStreamer/Rust dependency cho bản WebRTC-only. Không thay server contract ngoài mức cần thiết. Không xóa NativeStream nếu vẫn còn một import hoặc packaging path có thể được gọi lúc startup.
