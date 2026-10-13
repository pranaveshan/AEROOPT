const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';
export async function request<T>(path:string, init?:RequestInit):Promise<T>{
  const res=await fetch(`${API}${path}`,{...init,headers:{'Content-Type':'application/json',...(init?.headers??{})}});
  if(!res.ok){let msg=`Request failed (${res.status})`;try{const body=await res.json();msg=typeof body.detail==='string'?body.detail:JSON.stringify(body.detail??body)}catch{}throw new Error(msg)}
  return res.json() as Promise<T>;
}
export type Assignment={task_id:string;aircraft_id:string;crew_id:string;start:number;finish:number;explanation?:string[]};
export type Task={id:string;title:string;category:string;priority:number;release:number;earliest_start:number;latest_finish:number;duration:number;capabilities:string[];qualifications:string[];dependencies:string[];support_units:number;status:string};
export type Aircraft={id:string;type:string;capabilities:string[];home_facility:string;status:string;available_from:number;available_until:number;max_flight_minutes:number;used_flight_minutes:number;turnaround_minutes:number;maintenance:number[][]};
export type Crew={id:string;role:string;qualifications:string[];available_from:number;available_until:number;max_duty_minutes:number;used_duty_minutes:number;min_rest_minutes:number};
