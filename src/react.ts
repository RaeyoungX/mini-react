export interface VNode {
    type: string
    props: {
        children: VNode[]
        [key: string]: any
    }
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