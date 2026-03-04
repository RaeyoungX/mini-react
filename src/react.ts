export interface VNode {
    type: string
    props: {
        children: VNode[]
        [key: string]: any
    }
}

export interface Fiber {
    type: string | Function
    props: {
        children: VNode[]
        [key: string]: any
    }
    dom: HTMLElement | Text | null
    parent: Fiber | null
    child: Fiber | null
    sibling: Fiber | null
    alternate: Fiber | null
    effectTag: 'PLACEMENT' | 'UPDATE' | 'DELETION' | null
}

export function createElement(
    type: string,
    props: Record<string, any> | null,
    ...children: any[]
): VNode {
    return {
        type,
        props: {
            ...props,
            children: children.flat().map(child =>
                typeof child === 'object' ? child : createTextNode(String(child))
            )
        }
    }
}

function createTextNode(text: string): VNode {
    return {
        type: 'TEXT_ELEMENT',
        props: { nodeValue: text, children: [] }
    }
}

export function render(vnode: VNode, container: HTMLElement | Text) {
    const dom =
        vnode.type === 'TEXT_ELEMENT'
            ? document.createTextNode(vnode.props.nodeValue)
            : document.createElement(vnode.type)

    Object.keys(vnode.props)
        .filter(k => k !== 'children')
        .forEach(k => {
            if (k.startsWith('on')) {
                // onClick → click, onChange → change
                const eventType = k.slice(2).toLowerCase()
                dom.addEventListener(eventType, vnode.props[k])
            } else {
                (dom as any)[k] = vnode.props[k]
            }
        })

    vnode.props.children.forEach(child =>
        render(child, dom as HTMLElement)
    )

    container.appendChild(dom)
}

let workInProgress: Fiber | null = null
let wipRoot: Fiber | null = null

export function renderWithFiber(vnode: VNode, container: HTMLElement) {
    wipRoot = {
        type: 'ROOT',
        props: { children: [vnode] },
        dom: container,
        parent: null,
        child: null,
        sibling: null,
        alternate: null,
        effectTag: null,
    }
    workInProgress = wipRoot
    requestIdleCallback(workLoop)
}

function workLoop(deadline: IdleDeadline) {
    let shouldYield = false

    while (workInProgress && !shouldYield) {
        workInProgress = performUnitOfWork(workInProgress)
        shouldYield = deadline.timeRemaining() < 1
    }

    if (!workInProgress && wipRoot) {
        commitRoot()
    }

    requestIdleCallback(workLoop)
}

function performUnitOfWork(fiber: Fiber): Fiber | null {
    if (!fiber.dom && fiber.type !== 'ROOT') {
        fiber.dom = fiber.type === 'TEXT_ELEMENT'
            ? document.createTextNode(fiber.props.nodeValue)
            : document.createElement(fiber.type as string)

        Object.keys(fiber.props)
            .filter(k => k !== 'children')
            .forEach(k => {
                if (k.startsWith('on')) {
                    const eventType = k.slice(2).toLowerCase()
                    fiber.dom!.addEventListener(eventType, fiber.props[k])
                } else {
                    (fiber.dom as any)[k] = fiber.props[k]
                }
            })
    }

    const children = fiber.props.children || []
    let prevSibling: Fiber | null = null

    children.forEach((child, index) => {
        const newFiber: Fiber = {
            type: child.type,
            props: child.props,
            dom: null,
            parent: fiber,
            child: null,
            sibling: null,
            alternate: null,
            effectTag: 'PLACEMENT',
        }

        if (index === 0) fiber.child = newFiber
        else prevSibling!.sibling = newFiber

        prevSibling = newFiber
    })

    if (fiber.child) return fiber.child
    let next: Fiber | null = fiber
    while (next) {
        if (next.sibling) return next.sibling
        next = next.parent
    }
    return null
}

function commitRoot() {
    commitWork(wipRoot!.child)
    wipRoot = null
}

function commitWork(fiber: Fiber | null) {
    if (!fiber) return
    fiber.parent!.dom!.appendChild(fiber.dom!)
    commitWork(fiber.child)
    commitWork(fiber.sibling)
}
