import { useEffect, useState } from 'react';
import { api } from '../api.js';

/** Especialidades y profesionales (se cargan una vez y se comparten entre pantallas). */
let cache = null;

export function useCatalog() {
  const [catalog, setCatalog] = useState(cache || { specialties: [], professionals: [] });
  useEffect(() => {
    if (cache) return;
    Promise.all([api('/catalog/specialties'), api('/catalog/professionals')]).then(([specialties, professionals]) => {
      cache = { specialties, professionals };
      setCatalog(cache);
    });
  }, []);
  return catalog;
}
