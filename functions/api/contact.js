const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(value,max)=>String(value||"").trim().slice(0,max);
const escapeHtml=(value)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export async function onRequestPost({request,env}){
  if(!env.RESEND_API_KEY||!env.TURNSTILE_SECRET_KEY||!env.CONTACT_FROM_EMAIL)return json({ok:false,error:"Contact form is not configured yet."},503);
  const type=request.headers.get("content-type")||"";
  if(!type.includes("multipart/form-data")&&!type.includes("application/x-www-form-urlencoded"))return json({ok:false,error:"Invalid form submission."},415);
  if(Number(request.headers.get("content-length")||0)>20000)return json({ok:false,error:"Submission too large."},413);
  let data;try{data=await request.formData();}catch{return json({ok:false,error:"Invalid form submission."},400);}
  if(data.get("company_url"))return json({ok:true});
  const name=clean(data.get("name"),100),email=clean(data.get("email"),254),phone=clean(data.get("phone"),40),message=clean(data.get("message"),3000);
  if(!name||!email||!message||!/^\S+@\S+\.\S+$/.test(email))return json({ok:false,error:"Please complete the required fields."},400);
  const token=clean(data.get("cf-turnstile-response"),4096);
  if(!token)return json({ok:false,error:"Please complete the spam protection check."},400);
  let verification;
  try{
    const result=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token,remoteip:request.headers.get("CF-Connecting-IP")||undefined})});
    verification=await result.json();
  }catch{return json({ok:false,error:"Spam protection unavailable. Try again."},502);}
  if(!verification.success)return json({ok:false,error:"Spam protection failed. Please try again."},403);
  const from=`Website Enquiries <${clean(env.CONTACT_FROM_EMAIL,254)}>`;
  const to=clean(env.CONTACT_TO_EMAIL,254);
  if(!to||!/^\S+@\S+\.\S+$/.test(to))return json({ok:false,error:"Contact form recipient is not configured."},503);
  const payload={from,to:[to],reply_to:email,subject:"Convex Construction website enquiry",text:`Name: ${name}\nEmail: ${email}\nPhone: ${phone||"Not provided"}\n\nMessage:\n${message}`,html:`<h2>New website enquiry</h2><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Phone:</strong> ${escapeHtml(phone||"Not provided")}</p><p><strong>Message:</strong></p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`};
  try{
    const result=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    if(!result.ok){console.error("Resend delivery failed",result.status,await result.text());return json({ok:false,error:"Email delivery failed. Please try again later."},502);}
    return json({ok:true});
  }catch{return json({ok:false,error:"Email service unavailable. Please try again."},502);}
}
export function onRequestGet(){return json({ok:false,error:"Method not allowed."},405);}
