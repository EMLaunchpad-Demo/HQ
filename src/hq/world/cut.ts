// Sims-modus: "geen" = alles staat (buiten), "beneden" = een ruimte op het gelijkvloers is gekozen (dak, plafonds en
// tussenverdieping weg, muren laag), "boven" = een ruimte op de tussenverdieping (dak weg, muren boven laag).
import { createContext, useContext } from 'react';

export type Cut = 'geen' | 'beneden' | 'boven';
export const CutContext = createContext<Cut>('geen');
export const useCut = () => useContext(CutContext);
/** Hoogte van een muur "omlaag", zoals in De Sims. */
export const CUT = 0.9;
