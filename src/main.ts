import { createElement, renderWithFiber } from './react'

const vdom = createElement('div', { id: 'app' },
  createElement('h1', null, 'Hello Fiber'),
  createElement('p', null, 'rendered with fiber')
)

renderWithFiber(vdom, document.getElementById('root')!)
