import { createElement, renderWithFiber, useState } from './react'

/** @jsx createElement */
function Counter() {
  const [count, setCount] = useState(0)

  return createElement('div', null,
    createElement('h1', null, `Count: ${count}`),
    createElement('button', { onClick: () => setCount(n => n + 1) }, '+1'),
  )
}

renderWithFiber(
  createElement(Counter, {}),
  document.getElementById('root')!
)
