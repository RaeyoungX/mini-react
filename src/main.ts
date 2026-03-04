import { createElement, render } from './react'

let count = 0

function handleClick() {
  count++
  console.log('clicked:', count)
}

const vdom = createElement('div', { id: 'app' },
  createElement('h1', null, 'Hello mini React'),
  createElement('button', { onClick: handleClick }, 'Click me')
)

render(vdom, document.getElementById('root')!)