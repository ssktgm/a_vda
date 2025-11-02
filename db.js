// db.js: IndexedDBヘルパーモジュール

const DB_NAME = 'CarDispatchDB';
const DB_VERSION = 2; // バージョンは2のまま
const STORE_FAMILIES = 'families';
const STORE_CARS = 'cars';
const STORE_SAVED_STATES = 'savedStates';
const STORE_SAVED_PARKING = 'savedParking';

let db;

/**
 * データベースを開き、必要に応じて初期化します。
 * @param {Array} defaultFamilies - DBが空の場合に投入するデフォルトの家族データ
 * @param {Array} defaultCars - DBが空の場合に投入するデフォルトの車データ
 * @returns {Promise<IDBDatabase>} データベースインスタンス
 */
export function openDB(defaultFamilies = [], defaultCars = []) {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject('IndexedDBを開けませんでした。');
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    // DBのバージョンが古い場合や、DBが新規作成された場合に呼ばれる
    request.onupgradeneeded = (event) => {
      console.log('IndexedDB upgrade needed...');
      const tempDb = event.target.result;
      const tx = event.target.transaction;
      const oldVersion = event.oldVersion;

      // --- v1 (初期) ---
      if (oldVersion < 1) {
          // 家族ストア (主キー: familyName)
          if (!tempDb.objectStoreNames.contains(STORE_FAMILIES)) {
            tempDb.createObjectStore(STORE_FAMILIES, { keyPath: 'familyName' });
          }

          // 車ストア (主キー: id)
          if (!tempDb.objectStoreNames.contains(STORE_CARS)) {
            tempDb.createObjectStore(STORE_CARS, { keyPath: 'id' });
          }
          
          // v1のデフォルトデータ投入
          if (defaultFamilies.length > 0) {
              const familyStore = tx.objectStore(STORE_FAMILIES);
              console.log('Populating default families in onupgradeneeded (v1)...');
              defaultFamilies.forEach((family, index) => {
                  const familyWithOrder = { ...family, order: family.order ?? index }; 
                  familyStore.put(familyWithOrder);
              });
              console.log('Default families populated (v1).');
          }
          
          if (defaultCars.length > 0) {
              const carStore = tx.objectStore(STORE_CARS);
               console.log('Populating default cars in onupgradeneeded (v1)...');
              defaultCars.forEach(car => {
                  carStore.put(car);
              });
              console.log('Default cars populated (v1).');
          }
      }

      // --- ★ v2 (状態保存・駐車場保存) ---
      if (oldVersion < 2) {
          // 保存済み状態ストア
          if (!tempDb.objectStoreNames.contains(STORE_SAVED_STATES)) {
              const statesStore = tempDb.createObjectStore(STORE_SAVED_STATES, { keyPath: 'id', autoIncrement: true });
              // タイムスタンプでソート・検索するためにインデックス作成
              statesStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
          // 保存済み駐車場ストア
          if (!tempDb.objectStoreNames.contains(STORE_SAVED_PARKING)) {
              const parkingStore = tempDb.createObjectStore(STORE_SAVED_PARKING, { keyPath: 'id', autoIncrement: true });
              // タイムスタンプでソート・検索するためにインデックス作成
              parkingStore.createIndex('timestamp', 'timestamp', { unique: false });
              // ★ 名称でも検索・重複削除できるようにインデックス作成
              parkingStore.createIndex('name', 'name', { unique: false }); 
          }
      }
      
    };
  });
}

// --- 家族 (Families) ---
// (変更なし)

/**
 * 指定された家族を取得します。
 * @param {string} familyName - 取得する家族名
 * @returns {Promise<Object|undefined>} 家族データ
 */
export function getFamily(familyName) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not open');
    const tx = db.transaction(STORE_FAMILIES, 'readonly');
    const store = tx.objectStore(STORE_FAMILIES);
    const request = store.get(familyName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * すべての家族を取得します。
 * @returns {Promise<Array>} 家族データの配列
 */
export function getAllFamilies() {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not open');
    const tx = db.transaction(STORE_FAMILIES, 'readonly');
    const store = tx.objectStore(STORE_FAMILIES);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 家族データを追加または更新します。
 * @param {Object} family - 保存する家族データ
 * @returns {Promise<void>}
 */
export function addFamily(family) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not open');
    const tx = db.transaction(STORE_FAMILIES, 'readwrite');
    const store = tx.objectStore(STORE_FAMILIES);
    const request = store.put(family);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
// updateFamily は addFamily と同じ (putは追加/更新の両方を行う)
export const updateFamily = addFamily;

/**
 * 複数の家族データを一括で追加または更新します。
 * @param {Array} families - 保存する家族データの配列
 * @returns {Promise<void>}
 */
export function bulkAddFamilies(families) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not open');
        const tx = db.transaction(STORE_FAMILIES, 'readwrite');
        const store = tx.objectStore(STORE_FAMILIES);
        let count = 0;
        
        if (families.length === 0) {
            return resolve();
        }

        families.forEach(family => {
            const request = store.put(family);
            request.onsuccess = () => {
                count++;
                if (count === families.length) {
                    // トランザクション自体の完了を待つ
                }
            };
             request.onerror = (e) => {
                tx.abort(); // 1件でも失敗したら中断
                console.error('bulkAddFamilies error during put:', e.target.error);
                reject(e.target.error);
             }
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => {
             console.error('bulkAddFamilies transaction error:', tx.error);
             reject(tx.error);
        }
    });
}

/**
 * 家族データを削除します。
 * @param {string} familyName - 削除する家族名
 * @returns {Promise<void>}
 */
export function deleteFamily(familyName) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not open');
    const tx = db.transaction(STORE_FAMILIES, 'readwrite');
    const store = tx.objectStore(STORE_FAMILIES);
    const request = store.delete(familyName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * すべての家族データを削除します。
 * @returns {Promise<void>}
 */
export function clearFamilies() {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not open');
        const tx = db.transaction(STORE_FAMILIES, 'readwrite');
        const store = tx.objectStore(STORE_FAMILIES);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}


// --- 車 (Cars) ---
// (変更なし)

/**
 * 指定されたIDの車を取得します。
 * @param {string} carId - 取得する車のID
 * @returns {Promise<Object|undefined>} 車データ
 */
export function getCar(carId) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not open');
    const tx = db.transaction(STORE_CARS, 'readonly');
    const store = tx.objectStore(STORE_CARS);
    const request = store.get(carId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * すべての車を取得します。
 * @returns {Promise<Array>} 車データの配列
 */
export function getAllCars() {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not open');
    const tx = db.transaction(STORE_CARS, 'readonly');
    const store = tx.objectStore(STORE_CARS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 車データを追加または更新します。
 * @param {Object} car - 保存する車データ
 * @returns {Promise<void>}
 */
export function addCar(car) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not open');
    const tx = db.transaction(STORE_CARS, 'readwrite');
    const store = tx.objectStore(STORE_CARS);
    const request = store.put(car);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
// updateCar は addCar と同じ
export const updateCar = addCar;

/**
 * 複数の車データを一括で追加または更新します。
 * @param {Array} cars - 保存する車データの配列
 * @returns {Promise<void>}
 */
export function bulkAddCars(cars) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not open');
        const tx = db.transaction(STORE_CARS, 'readwrite');
        const store = tx.objectStore(STORE_CARS);
        let count = 0;

        if (cars.length === 0) {
            return resolve();
        }
        
        cars.forEach(car => {
            const request = store.put(car);
            request.onsuccess = () => {
                count++;
                if (count === cars.length) {
                    // トランザクション自体の完了を待つ
                }
            };
             request.onerror = (e) => {
                tx.abort(); // 1件でも失敗したら中断
                console.error('bulkAddCars error during put:', e.target.error);
                reject(e.target.error);
             }
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => {
            console.error('bulkAddCars transaction error:', tx.error);
            reject(tx.error);
        }
    });
}

/**
 * 車データを削除します。
 * @param {string} carId - 削除する車のID
 * @returns {Promise<void>}
 */
export function deleteCar(carId) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not open');
    const tx = db.transaction(STORE_CARS, 'readwrite');
    const store = tx.objectStore(STORE_CARS);
    const request = store.delete(carId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * すべての車データを削除します。
 * @returns {Promise<void>}
 */
export function clearCars() {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not open');
        const tx = db.transaction(STORE_CARS, 'readwrite');
        const store = tx.objectStore(STORE_CARS);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// --- ★ 新規: 保存済み状態 (Saved States) ---

/**
 * IDで単一の保存済み状態を取得します。
 * @param {number} id - 取得する状態のID
 * @returns {Promise<Object|undefined>} 状態データ
 */
export function getSavedState(id) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not open');
        const tx = db.transaction(STORE_SAVED_STATES, 'readonly');
        const store = tx.objectStore(STORE_SAVED_STATES);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * すべての保存済み状態をタイムスタンプ降順で取得します。
 * @returns {Promise<Array>} 状態データの配列
 */
export function getAllSavedStates() {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not open');
        const tx = db.transaction(STORE_SAVED_STATES, 'readonly');
        const store = tx.objectStore(STORE_SAVED_STATES);
        // const index = store.index('timestamp');
        // 降順 (prev) で取得
        // const request = index.getAll(null, 'prev'); // ★ 誤り
        const request = store.getAll(); // ★ 修正: まず全件取得

        request.onsuccess = () => {
            // ★ 修正: 取得後にJSでソート
            const result = request.result || [];
            result.sort((a, b) => b.timestamp - a.timestamp); // 降順ソート
            resolve(result);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * 状態データを追加し、古いデータを削除して件数制限（limit）を守ります。
 * @param {Object} stateData - 保存する状態データ { name, timestamp, state }
 * @param {number} limit - 最大保存件数
 * @returns {Promise<void>}
 */
export function addSavedState(stateData, limit = 5) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not open');
        const tx = db.transaction(STORE_SAVED_STATES, 'readwrite');
        const store = tx.objectStore(STORE_SAVED_STATES);
        
        // 1. まずデータを追加
        store.put(stateData).onsuccess = () => {
            // 2. 件数をチェック
            store.count().onsuccess = (e) => {
                const count = e.target.result;
                if (count > limit) {
                    // 3. 上限を超えていたら、古いもの（昇順カーソルの先頭）を削除
                    const itemsToDelete = count - limit;
                    let deletedCount = 0;
                    // タイムスタンプのインデックスを昇順 (next) で開く
                    const index = store.index('timestamp');
                    const cursorRequest = index.openCursor(null, 'next');
                    
                    cursorRequest.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor && deletedCount < itemsToDelete) {
                            cursor.delete(); // 古い項目を削除
                            deletedCount++;
                            cursor.continue();
                        }
                    };
                }
            };
        };
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// --- ★ 新規: 保存済み駐車場 (Saved Parking) ---

/**
 * IDで単一の保存済み駐車場データを取得します。
 * @param {number} id - 取得する駐車場データのID
 * @returns {Promise<Object|undefined>} 駐車場データ
 */
export function getSavedParking(id) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not open');
        const tx = db.transaction(STORE_SAVED_PARKING, 'readonly');
        const store = tx.objectStore(STORE_SAVED_PARKING);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * すべての保存済み駐車場データをタイムスタンプ降順で取得します。
 * @returns {Promise<Array>} 駐車場データの配列
 */
export function getAllSavedParking() {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not open');
        const tx = db.transaction(STORE_SAVED_PARKING, 'readonly');
        const store = tx.objectStore(STORE_SAVED_PARKING);
        // const index = store.index('timestamp');
        // 降順 (prev) で取得
        // const request = index.getAll(null, 'prev'); // ★ 誤り
        const request = store.getAll(); // ★ 修正: まず全件取得
        
        request.onsuccess = () => {
            // ★ 修正: 取得後にJSでソート
            const result = request.result || [];
            result.sort((a, b) => b.timestamp - a.timestamp); // 降順ソート
            resolve(result);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * 駐車場データを追加し、古いデータを削除して件数制限（limit）を守ります。
 * 名称が重複するデータがあれば、タイムスタンプを更新して上書きします。
 * @param {Object} parkingData - 保存する駐車場データ { name, limit, memo, timestamp }
 * @param {number} limit - 最大保存件数
 * @returns {Promise<void>}
 */
export function addSavedParking(parkingData, limit = 20) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not open');
        const tx = db.transaction(STORE_SAVED_PARKING, 'readwrite');
        const store = tx.objectStore(STORE_SAVED_PARKING);
        // const nameIndex = store.index('name'); // ★ 削除 (同名でも別データとして保存)

        // 1. まず、同じ名前のデータが既にないか確認
        // nameIndex.get(parkingData.name).onsuccess = (e) => { // ★ 削除
            // const existing = e.target.result; // ★ 削除
            // if (existing) { // ★ 削除
                // 存在する場合、IDを引き継いでタイムスタンプを更新 (実質的な上書き)
                // parkingData.id = existing.id;  // ★ 削除
            // } // ★ 削除
            
            // 2. データを追加
            store.put(parkingData).onsuccess = () => {
                // 3. 件数をチェック
                store.count().onsuccess = (e) => {
                    const count = e.target.result;
                    if (count > limit) {
                        // 4. 上限を超えていたら、古いもの（昇順カーソルの先頭）を削除
                        const itemsToDelete = count - limit;
                        let deletedCount = 0;
                        const tsIndex = store.index('timestamp');
                        const cursorRequest = tsIndex.openCursor(null, 'next'); // 昇順
                        
                        cursorRequest.onsuccess = (event) => {
                            const cursor = event.target.result;
                            if (cursor && deletedCount < itemsToDelete) {
                                cursor.delete(); // 古い項目を削除
                                deletedCount++;
                                cursor.continue();
                            }
                        };
                    }
                };
            };
        // }; // ★ 削除
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// --- ★ 新規: 削除と全クリア ---

/**
 * IDで指定された保存済み状態を削除します。
 * @param {number} id - 削除する状態のID
 * @returns {Promise<void>}
 */
export function deleteSavedState(id) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not open');
        const tx = db.transaction(STORE_SAVED_STATES, 'readwrite');
        const store = tx.objectStore(STORE_SAVED_STATES);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * IDで指定された保存済み駐車場を削除します。
 * @param {number} id - 削除する駐車場のID
 * @returns {Promise<void>}
 */
export function deleteSavedParking(id) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not open');
        const tx = db.transaction(STORE_SAVED_PARKING, 'readwrite');
        const store = tx.objectStore(STORE_SAVED_PARKING);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * データベースのすべてのストアをクリアします（全データ初期化）。
 * @returns {Promise<void>}
 */
export function clearAllData() {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not open');
        // すべてのストア名を指定
        const storeNames = [STORE_FAMILIES, STORE_CARS, STORE_SAVED_STATES, STORE_SAVED_PARKING];
        const tx = db.transaction(storeNames, 'readwrite');
        
        let clearCount = 0;
        const totalStores = storeNames.length;

        storeNames.forEach(storeName => {
            const store = tx.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => {
                clearCount++;
                if (clearCount === totalStores) {
                    // すべてのクリアが成功
                }
            };
            request.onerror = (e) => {
                tx.abort();
                reject(e.target.error);
            };
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

