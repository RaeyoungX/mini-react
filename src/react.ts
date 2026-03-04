export interface VNode {
    type: string | Function
    props: {
        children: VNode[]
        [key: string]: any
    }
}

interface Hook<T = any> {
    state: T
    queue: Array<T | ((prev: T) => T)>
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
    hooks: Hook[] | null
    hookIndex: number
}

export function createElement(
    type: string | Function,
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
    if (typeof vnode.type === 'function') {
        render((vnode.type as Function)(vnode.props), container)
        return
    }

    const dom =
        vnode.type === 'TEXT_ELEMENT'
            ? document.createTextNode(vnode.props.nodeValue)
            : document.createElement(vnode.type as string)

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
let wipFiber: Fiber | null = null
let currentRoot: Fiber | null = null
let deletions: Fiber[] = []

export function renderWithFiber(vnode: VNode, container: HTMLElement) {
    wipRoot = {
        type: 'ROOT',
        props: { children: [vnode] },
        dom: container,
        parent: null,
        child: null,
        sibling: null,
        alternate: currentRoot,
        effectTag: null,
        hooks: null,
        hookIndex: 0,
    }
    workInProgress = wipRoot
    deletions = []
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
    if (fiber.type instanceof Function) {
        updateFunctionComponent(fiber)
    } else {
        updateHostComponent(fiber)
    }

    if (fiber.child) return fiber.child
    let next: Fiber | null = fiber
    while (next) {
        if (next.sibling) return next.sibling
        next = next.parent
    }
    return null
}

function updateFunctionComponent(fiber: Fiber) {
    wipFiber = fiber
    wipFiber.hooks = []
    wipFiber.hookIndex = 0

    const children = [(fiber.type as Function)(fiber.props)] as VNode[]
    reconcileChildren(fiber, children)
}

function updateHostComponent(fiber: Fiber) {
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
    reconcileChildren(fiber, fiber.props.children || [])
}

function reconcileChildren(wipFiber: Fiber, elements: VNode[]) {
    let index = 0
    let oldFiber = wipFiber.alternate?.child || null
    let prevSibling: Fiber | null = null

    wipFiber.child = null

    while (index < elements.length || oldFiber) {
        const element = elements[index]
        let newFiber: Fiber | null = null
        const sameType = !!element && !!oldFiber && element.type === oldFiber.type

        if (sameType && oldFiber) {
            newFiber = {
                type: oldFiber.type,
                props: element.props,
                dom: oldFiber.dom,
                parent: wipFiber,
                child: null,
                sibling: null,
                alternate: oldFiber,
                effectTag: 'UPDATE',
                hooks: null,
                hookIndex: 0,
            }
        }

        if (element && !sameType) {
            newFiber = {
                type: element.type,
                props: element.props,
                dom: null,
                parent: wipFiber,
                child: null,
                sibling: null,
                alternate: null,
                effectTag: 'PLACEMENT',
                hooks: null,
                hookIndex: 0,
            }
        }

        if (oldFiber && !sameType) {
            oldFiber.effectTag = 'DELETION'
            deletions.push(oldFiber)
        }

        if (oldFiber) oldFiber = oldFiber.sibling

        if (newFiber) {
            if (index === 0) wipFiber.child = newFiber
            else prevSibling!.sibling = newFiber
            prevSibling = newFiber
        }

        index++
    }
}

function commitRoot() {
    deletions.forEach(commitWork)
    commitWork(wipRoot!.child)
    currentRoot = wipRoot
    wipRoot = null
}

function commitWork(fiber: Fiber | null) {
    if (!fiber) return

    let domParentFiber = fiber.parent
    while (domParentFiber && !domParentFiber.dom) {
        domParentFiber = domParentFiber.parent
    }

    const domParent = domParentFiber?.dom
    if (!domParent) return

    if (fiber.effectTag === 'PLACEMENT' && fiber.dom) {
        domParent.appendChild(fiber.dom)
    } else if (fiber.effectTag === 'UPDATE' && fiber.dom && fiber.alternate) {
        updateDom(fiber.dom, fiber.alternate.props, fiber.props)
    } else if (fiber.effectTag === 'DELETION') {
        commitDeletion(fiber, domParent)
        return
    }

    commitWork(fiber.child)
    commitWork(fiber.sibling)
}

function commitDeletion(fiber: Fiber, domParent: HTMLElement | Text) {
    if (fiber.dom) {
        domParent.removeChild(fiber.dom)
    } else if (fiber.child) {
        commitDeletion(fiber.child, domParent)
    }
}

function updateDom(
    dom: HTMLElement | Text,
    prevProps: Record<string, any>,
    nextProps: Record<string, any>
) {
    Object.keys(prevProps)
        .filter(key => key.startsWith('on'))
        .forEach(key => {
            const eventType = key.slice(2).toLowerCase()
            const changed = !(key in nextProps) || prevProps[key] !== nextProps[key]
            if (changed) {
                dom.removeEventListener(eventType, prevProps[key])
            }
        })

    Object.keys(prevProps)
        .filter(key => key !== 'children' && !key.startsWith('on'))
        .forEach(key => {
            if (!(key in nextProps)) {
                (dom as any)[key] = ''
            }
        })

    Object.keys(nextProps)
        .filter(key => key !== 'children' && !key.startsWith('on'))
        .forEach(key => {
            if (prevProps[key] !== nextProps[key]) {
                (dom as any)[key] = nextProps[key]
            }
        })

    Object.keys(nextProps)
        .filter(key => key.startsWith('on'))
        .forEach(key => {
            if (prevProps[key] !== nextProps[key]) {
                const eventType = key.slice(2).toLowerCase()
                dom.addEventListener(eventType, nextProps[key])
            }
        })
}

export function useState<T>(initialState: T): [T, (action: T | ((prev: T) => T)) => void] {
    const oldHook = wipFiber?.alternate?.hooks?.[wipFiber.hookIndex]

    const hook: Hook<T> = {
        state: oldHook ? oldHook.state : initialState,
        queue: [],
    }

    if (oldHook) {
        oldHook.queue.forEach((action: any) => {
            hook.state = typeof action === 'function' ? action(hook.state) : action
        })
    }

    const setState = (action: T | ((prev: T) => T)) => {
        hook.queue.push(action)

        wipRoot = {
            type: 'ROOT',
            props: currentRoot!.props,
            dom: currentRoot!.dom,
            parent: null,
            child: null,
            sibling: null,
            alternate: currentRoot,
            effectTag: null,
            hooks: null,
            hookIndex: 0,
        }
        workInProgress = wipRoot
        deletions = []
    }

    wipFiber!.hooks!.push(hook)
    wipFiber!.hookIndex++

    return [hook.state, setState]
}
