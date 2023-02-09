// General purpose utils
export function show (x) {
    if (x === null || x === undefined) return ' - '
    const typ = typeof x
    switch (typ) {
        case 'null':
        case 'undefined': return 'x'
        case 'string': return `"${x}"`
        case 'boolean':
        case 'number': return x.toString()
        case  'object':
            if (x.length) return '[' + x.slice(0, 3).map(show).join(', ') + ']'
            return '{' + Object.keys(x).slice(0,3).map(k => ` ${k}: ${short(x[k])}`).join('; ') + '}'

        default: return `Type ${typ} ??`
    }
}

export function short (x) {
    if (x === null) return 'null'
    if (!x || typeof x !== 'object') return '*';
    if (x.length) return `[${x.length}]`;
    return `{${Object.keys(x).length}}`;
}
