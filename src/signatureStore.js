function database(){return new Promise((resolve,reject)=>{const request=indexedDB.open('list-signatures',1);request.onupgradeneeded=()=>request.result.createObjectStore('items',{keyPath:'id'});request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result)})}
async function operation(mode,action){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('items',mode),store=tx.objectStore('items');let request;try{request=action(store)}catch(e){db.close();reject(e);return}tx.oncomplete=()=>{db.close();resolve(request?.result)};tx.onerror=()=>{db.close();reject(tx.error)}})}
export const listSignatures=()=>operation('readonly',store=>store.getAll());
export const saveSignature=item=>operation('readwrite',store=>store.put(item));
export const deleteSignature=id=>operation('readwrite',store=>store.delete(id));
