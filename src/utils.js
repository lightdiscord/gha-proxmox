export function parsePropertyList(string) {
    return Object.fromEntries(string.split(",").map((property) => property.split('=', 2)))
}

export function stringifyPropertyList(propertyList) {
    return Object.entries(propertyList).map(([key, value]) => `${key}=${value}`).join(',')
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));