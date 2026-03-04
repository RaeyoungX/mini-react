import { createElement, render } from './react'

const vdom = createElement('div', { id: 'app' },
  createElement('h1', null, 'Hello mini React'),
  createElement('p', null, 'it works!')
)

render(vdom, document.getElementById('root')!)