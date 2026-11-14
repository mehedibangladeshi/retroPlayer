/** Which lamp of a two-lamp switch glows: green when on, red when off. */
export const switchLamps = (on: boolean): { red: boolean; green: boolean } => ({ red: !on, green: on })
