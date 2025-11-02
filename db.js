// db.js: IndexedDBヘルパーモジュール

const DB_NAME = 'CarDispatchDB';
const DB_VERSION = 1; // バージョンは1のまま (スキーマ変更なし、インデックス追加しないため)
const STORE_FAMILIES = 'families';
const STORE_CARS = 'cars';

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
      
      // 家族ストア (主キー: familyName)
      if (!tempDb.objectStoreNames.contains(STORE_FAMILIES)) {
        tempDb.createObjectStore(STORE_FAMILIES, { keyPath: 'familyName' });
      }

      // 車ストア (主キー: id)
      if (!tempDb.objectStoreNames.contains(STORE_CARS)) {
        tempDb.createObjectStore(STORE_CARS, { keyPath: 'id' });
      }

      // デフォルトデータの投入 (トランザクションが完了する前に実行)
      // ★ 修正: onupgradeneeded 内のトランザクション (event.target.transaction) を使う
      const tx = event.target.transaction;
      
      if (defaultFamilies.length > 0) {
          const familyStore = tx.objectStore(STORE_FAMILIES);
          console.log('Populating default families in onupgradeneeded...');
          defaultFamilies.forEach((family, index) => {
              // ★ 修正: 呼び出し元でorderが付与されているはずだが、なければindexを付与
              const familyWithOrder = { ...family, order: family.order ?? index }; 
              familyStore.put(familyWithOrder);
          });
          console.log('Default families populated.');
      }
      
      if (defaultCars.length > 0) {
          const carStore = tx.objectStore(STORE_CARS);
           console.log('Populating default cars in onupgradeneeded...');
          defaultCars.forEach(car => {
              carStore.put(car);
          });
          console.log('Default cars populated.');
      }
    };
  });
}

// --- 家族 (Families) ---

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

