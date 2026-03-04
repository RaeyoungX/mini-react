# mini-react

![CI](https://img.shields.io/badge/build-passing-brightgreen)
![Version](https://img.shields.io/badge/version-0.3.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

> 从零实现的 React 核心，包含 Fiber 架构、可中断渲染、Hooks 系统。  
> 目的不是替代 React，而是通过实现来真正理解它。

---

## 目录

- [实现进度](#实现进度)
- [为什么做这个](#为什么做这个)
- [架构设计](#架构设计)
- [核心实现思路](#核心实现思路)
  - [1. createElement](#1-createelement)
  - [2. 同步渲染的问题](#2-同步渲染的问题)
  - [3. Fiber 架构](#3-fiber-架构)
  - [4. useState](#4-usestate)
- [和真实 React 的差异](#和真实-react-的差异)
- [运行方式](#运行方式)
- [学习路径](#学习路径)

---

## 实现进度

- [x] `createElement` — JSX 转 VNode
- [x] `render` — VNode 渲染为真实 DOM
- [x] 事件绑定 — `onClick` / `onChange` 等
- [x] Fiber 节点结构
- [x] 工作循环 — `requestIdleCallback` 可中断调度
- [x] `commitRoot` — 批量提交 DOM 变更
- [x] `useState` — 跨渲染持久化状态
- [ ] `useEffect` — 副作用处理
- [ ] Diff 优化 — 复用 DOM 节点
- [ ] `key` 属性支持

---

## 为什么做这个

在准备面试的过程中，发现自己能背出"Fiber 是链表结构"、"useState 存在 fiber 节点上"，但说不清楚**为什么这样设计**。

与其反复看别人的讲解，不如自己动手实现一遍。写完之后对这几个问题有了真正的理解：

- 为什么 React 要引入 Fiber，递归渲染有什么根本问题？
- `useState` 的状态存在哪里，为什么函数每次重跑状态不会丢失？
- `commit` 阶段为什么要和 `render` 阶段分开？

---

## 架构设计

### 整体流程

```
JSX
 │
 │  编译器转换（Babel / tsc）
 ▼
createElement()        → 生成 VNode 对象树
 │
 │  render() 触发
 ▼
构建 Fiber 树          → 每个 VNode 变成 Fiber 节点
 │
 │  requestIdleCallback 调度
 ▼
workLoop()             → 可中断的工作循环
 │
 ├── performUnitOfWork()   处理单个 Fiber 节点
 │       └── reconcileChildren()  对比新旧子节点，打 effectTag
 │
 │  全部处理完毕
 ▼
commitRoot()           → 一次性将所有变更提交到真实 DOM
```

### Fiber 链表结构

每个组件/DOM节点都对应一个 Fiber 节点，通过三个指针连接成树形链表：

```
         wipRoot
            │
            │ child
            ▼
          <div>  ──sibling──▶  (null)
            │
            │ child
            ▼
          <h1>   ──sibling──▶  <button>  ──sibling──▶  (null)
            │                     │
            │ child                │ child
            ▼                     ▼
        "Count:0"              "+1"


每个 Fiber 节点包含：
┌─────────────────────────────┐
│  type      'div' / Function │
│  props     { children, ...} │
│  dom       真实 DOM 节点     │
│  parent    ↑ 父节点          │
│  child     ↓ 第一个子节点    │
│  sibling   → 下一个兄弟      │
│  alternate   上次渲染的对应  │
│  effectTag   PLACEMENT/UPDATE│
│  hooks     useState 链表     │
└─────────────────────────────┘
```

### 工作循环调度

```
主线程时间线：

│████ JS任务 ████│░░░░░░░░░空闲░░░░░░░░░│████ 渲染帧 ████│

                  ↑ requestIdleCallback 触发
                  
workLoop 在空闲时间片内处理 Fiber 节点：

空闲时间 16ms
├── 处理 Fiber #1  (2ms)
├── 处理 Fiber #2  (2ms)
├── 处理 Fiber #3  (2ms)
├── 剩余时间 < 1ms → 暂停，让出主线程
│
└── 下次空闲继续...
```

---

## 核心实现思路

### 1. createElement

JSX 只是语法糖，编译器会把它转成 `createElement` 调用：

```jsx
// 你写的
<div className="app">
  <h1>Hello</h1>
</div>

// 编译器转成
createElement('div', { className: 'app' },
  createElement('h1', null, 'Hello')
)

// createElement 返回一个普通对象（VNode）
{
  type: 'div',
  props: {
    className: 'app',
    children: [
      { type: 'h1', props: { children: [{ type: 'TEXT_ELEMENT', props: { nodeValue: 'Hello' }}] }}
    ]
  }
}
```

**关键认知**：JSX 不是魔法，就是函数调用，返回普通 JS 对象。

---

### 2. 同步渲染的问题

最初的 `render` 是递归的：

```javascript
function render(vnode, container) {
  const dom = document.createElement(vnode.type)
  vnode.props.children.forEach(child => render(child, dom))  // 递归
  container.appendChild(dom)
}
```

**问题**：组件树很深时（比如 1000 个节点），这个递归调用栈无法中断。
执行期间浏览器无法处理用户输入、无法更新动画，页面卡死。

这就是 React 15 → React 16 引入 Fiber 的根本原因。

---

### 3. Fiber 架构

**核心思路**：把递归树遍历，改成可中断的链表循环。

```javascript
// 旧：递归，不可中断
function render(vnode) {
  vnode.children.forEach(child => render(child))  // 深度优先递归
}

// 新：循环，可中断
function workLoop(deadline) {
  while (nextFiber && deadline.timeRemaining() > 1) {
    nextFiber = performUnitOfWork(nextFiber)  // 每次只处理一个节点
  }
  requestIdleCallback(workLoop)  // 让出后继续
}
```

**遍历顺序**（深度优先）：

```
performUnitOfWork 返回下一个节点的规则：
1. 有 child → 返回 child（往下走）
2. 没有 child 但有 sibling → 返回 sibling（往右走）  
3. 都没有 → 往上找 parent，再找 parent.sibling（回溯）
```

**为什么 commit 阶段要一次性提交？**

如果每处理完一个 Fiber 就立即操作 DOM，中途被中断时用户会看到渲染了一半的 UI。
所以 render 阶段只做计算（打 effectTag），全部完成后 commit 阶段一次性操作 DOM，
用户永远看不到中间状态。

---

### 4. useState

**核心问题**：函数组件每次渲染都重新执行，状态存在哪里才不会丢失？

```javascript
function Counter() {
  const [count, setCount] = useState(0)
  // 这个函数每次重渲都会重新执行
  // count 不能是局部变量，否则每次都是 0
}
```

**解决方案**：状态存在 Fiber 节点的 `hooks` 数组上，不在函数作用域里。

```javascript
// Fiber 节点（在组件外部，渲染之间持久存在）
fiber.hooks = [
  { state: 3, queue: [] },   // 第一个 useState 的状态
  { state: 'dark', queue: [] } // 第二个 useState 的状态
]

// 每次执行函数组件时，hookIndex 从 0 开始
// 第 N 次调用 useState → 取 hooks[N] 的状态
// 这就是为什么 hooks 不能在条件语句里调用——顺序必须固定
```

**setState 触发更新的流程**：

```
setCount(n => n + 1)
    │
    ├── 把 action 推入 hook.queue
    │
    └── 创建新的 wipRoot（以 currentRoot 为 alternate）
            │
            └── 设置 workInProgress = wipRoot
                    │
                    └── workLoop 开始新一轮渲染
                            │
                            └── 处理 hooks 时取出 queue，计算新 state
```

---

## 和真实 React 的差异

| 特性 | mini-react | 真实 React |
|------|-----------|-----------|
| 调度器 | `requestIdleCallback` | 自实现调度器（`MessageChannel`），更精准 |
| 优先级 | 无 | Lane 模型，多优先级并发 |
| Diff | 简单按顺序对比 | key-based diff，支持移动节点 |
| Hooks | `useState` | `useState` / `useEffect` / `useRef` / `useMemo` 等 |
| 错误处理 | 无 | Error Boundary |
| 并发模式 | 无 | `useTransition` / `useDeferredValue` |
| 服务端渲染 | 无 | `renderToString` / Streaming SSR |

**为什么真实 React 不用 `requestIdleCallback`？**

rIC 的问题：
1. 浏览器兼容性不够好
2. 调用频率不稳定，在后台 tab 会被大幅限制
3. 无法控制优先级

React 用 `MessageChannel` 自己模拟了一个调度器，能精确控制每帧的工作时长，并支持优先级插队。

---

## 运行方式

```bash
# 安装依赖
npm install

# 开发模式
npx vite

# 类型检查
npx tsc --noEmit
```

---

## 学习路径

如果你想系统理解 React 原理，建议按这个顺序：

1. **本项目** — 理解最小可运行的 React 模型
2. **[build-your-own-react](https://pomb.us/build-your-own-react/)** — Rodrigo Pombo 的经典教程，本项目参考来源之一
3. **React 源码** — 看 `packages/react-reconciler`，对照本项目理解差异
4. **React 设计理念文档** — [react.dev/learn/thinking-in-react](https://react.dev/learn/thinking-in-react)