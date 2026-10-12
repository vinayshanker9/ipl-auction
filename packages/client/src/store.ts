import {create} from "zustand";import type{AuctionState}from"@crease/shared";
type Store={auction:AuctionState|null;setAuction:(a:AuctionState|null)=>void;myTeam:string|null;setMyTeam:(id:string|null)=>void;room:any;setRoom:(r:any)=>void;error:string;setError:(s:string)=>void};
export const useStore=create<Store>(set=>({auction:null,setAuction:auction=>set({auction}),myTeam:null,setMyTeam:myTeam=>set({myTeam}),room:null,setRoom:room=>set({room}),error:"",setError:error=>set({error})}));
