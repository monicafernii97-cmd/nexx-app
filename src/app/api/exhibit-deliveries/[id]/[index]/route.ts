import {auth} from "@clerk/nextjs/server";
import {getAuthenticatedConvexClient} from "@/lib/convexServer";
import {api} from "@convex/_generated/api";
import type {Id} from "@convex/_generated/dataModel";
export async function GET(_:Request,{params}:{params:Promise<{id:string;index:string}>}) {
  if(!(await auth()).userId)return Response.json({error:"Authentication required."},{status:401});
  const {id,index}=await params;
  if(!/^\d+$/.test(index))return Response.json({error:"Not found."},{status:404});
  try {
    const c=await getAuthenticatedConvexClient();
    const a=await c.query(api.exhibitDelivery.download,{id:id as Id<"exhibitDeliveries">,index:Number(index)});
    if(!a.url)throw new Error("Unavailable");
    const response=await fetch(a.url,{cache:"no-store",signal:AbortSignal.timeout(30000)});
    if(!response.ok||!response.body)return Response.json({error:"Storage temporarily unavailable."},{status:502});
    const filename=a.filename.split("/").pop()!.replace(/[^a-zA-Z0-9._-]/g,"_");
    return new Response(response.body,{headers:{"Content-Type":a.mimeType,"Content-Disposition":`attachment; filename="${filename}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",...(a.sha256?{ETag:`"${a.sha256}"`}:{})}});
  }catch{return Response.json({error:"Delivery unavailable or access revoked."},{status:404});}
}
