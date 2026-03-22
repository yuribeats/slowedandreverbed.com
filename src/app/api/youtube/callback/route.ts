import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/youtube/callback`
  );
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  try {
    const oauth2 = getOAuth2Client();
    const { tokens } = await oauth2.getToken(code);

    if (tokens.refresh_token) {
      return new NextResponse(
        `<html><body style="background:#000;color:#fff;font-family:Arial;padding:40px">
          <h2 style="font-weight:700;letter-spacing:2px">YOUTUBE CONNECTED</h2>
          <p style="font-size:12px;letter-spacing:1px;margin-top:20px">ADD THIS REFRESH TOKEN TO VERCEL ENV AS <strong>YOUTUBE_REFRESH_TOKEN</strong>:</p>
          <pre style="background:#111;padding:16px;margin-top:12px;word-break:break-all;font-size:11px">${tokens.refresh_token}</pre>
          <p style="font-size:11px;margin-top:20px;opacity:0.5">THEN REDEPLOY. YOU ONLY NEED TO DO THIS ONCE.</p>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    return new NextResponse(
      `<html><body style="background:#000;color:#fff;font-family:Arial;padding:40px">
        <h2 style="font-weight:700;letter-spacing:2px">AUTH OK BUT NO REFRESH TOKEN</h2>
        <p style="font-size:12px">TRY REVOKING ACCESS AT <a href="https://myaccount.google.com/permissions" style="color:#E89030">GOOGLE PERMISSIONS</a> AND RE-AUTHORIZING.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
