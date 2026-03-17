# 学生节抽奖系统

奖券格式：**字母 (P/O/W/E/R) + 数字 (1–48)**，共 5×48 = 240 张。

## 抽奖轮次（当前实现）

| 轮次 | 奖项 | 规则 |
|------|------|------|
| 第一轮 | 三等奖 | POWER 五个字母中抽 **3 个字母**（逐次抽取，叠图亮灯效果） |
| 第二轮 | 二等奖 | 在 **1-48** 中抽 **12 个数字**（动画过程每帧保持 9 个亮灯） |
| 第三轮 | 一等奖 | 先过场动画，再抽 **32 个字母+数字**；每屏 16 个，分两屏展示，且排除二等奖数字 |
| 第四轮 | 特等奖 | 按预案抽 **1 个字母+数字** |

## 关键规则

- 一等奖号码池会排除所有二等奖号码（即二等奖得主不参与一等奖）。
- 一等奖 32 个结果按两屏显示（16 + 16），且两屏不重复。
- 一等奖结果支持点击号码全屏放大，方便“无人响应”点名。

## 运行方式

### 方式一：直接打开（本机使用）

- 双击 `index.html` 用浏览器打开，或拖入浏览器窗口。
- 大屏展示：点击「打开大屏展示」，会弹出新窗口，可拖到投影/第二屏全屏播放。**控制端与大屏需为同一浏览器同一页面打开**（由控制端弹出的窗口），否则无法同步。

### 方式二：本地服务器（推荐，多设备/大屏）

在项目目录下执行任一命令，再在浏览器访问提示的地址（如 `http://localhost:8080`）。

**Python 3：**
```bash
python3 -m http.server 8080
```

**Node.js（需已安装 npx）：**
```bash
npx -y serve -p 8080
```

**使用启动脚本（已安装 Python 3 时）：**
```bash
./start.sh
# 或
bash start.sh
```

然后在电脑或同一局域网内的手机/平板/大屏设备浏览器中打开：

- 控制端：`http://localhost:8080` 或 `http://你的电脑IP:8080`
- 大屏：由控制端点击「打开大屏展示」弹出的页面，或在新标签页打开 `http://.../screen.html` 并全屏。  
  **注意**：大屏若单独在另一设备打开 `screen.html`，无法接收控制端抽奖结果，需用同一台电脑的控制端弹出大屏，或自行改造为通过后端/WebSocket 同步。

## 部署到其他设备

1. 将整个项目文件夹复制到目标电脑（或 U 盘、网盘）。
2. 在该电脑上按上面「方式二」在项目目录启动本地服务器。
3. 本机访问 `http://localhost:8080` 做控制端；大屏可在此电脑上用「打开大屏展示」全屏，或接投影/第二块屏幕。

若希望手机/平板只做**查看结果**（不操作抽奖），目前需与控制端在同一浏览器会话（由控制端打开大屏窗口）。跨设备实时同步需后续增加服务端或 WebSocket 支持。

## 文件说明

- `index.html` — 抽奖控制页
- `screen.html` — 大屏展示页（3×3 二等奖、一等奖名单等）
- `styles.css` — 样式
- `app.js` — 抽奖逻辑与界面
- `start.sh` — 一键启动本地服务器（默认 8080 端口）

## 素材目录约定（工作区内）

请将素材放到工作区 `assets` 目录下（可按此命名）：

- `assets/background/main-bg.png`
- `assets/background/third-prize-bg.png`
- `assets/background/second-prize-bg.png`
- `assets/background/first-cutscene-bg.png`
- `assets/background/first-prize-bg.png`
- `assets/background/special-prize-bg.png`
- `assets/effects/selected-glow.png`
- `assets/letters/P_off.png` ... `assets/letters/R_off.png`
- `assets/letters/P_on.png` ... `assets/letters/R_on.png`

## 浏览器建议

推荐使用 Chrome、Edge、Safari 等现代浏览器，以获得最佳显示和弹窗同步效果。
