let user;
const listeners=new Set();
export const getAccount=()=>user;
export function setAccount(value){user=value;for(const listener of listeners)listener(value)}
export function subscribeAccount(listener){listeners.add(listener);return()=>listeners.delete(listener)}
