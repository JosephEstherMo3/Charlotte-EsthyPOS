# PowerShell setup script for Esthy-POS
# -------------------------------------------------
# 1. Clean old Vercel credentials (PowerShell equivalent of 'rmdir /S /Q')
if (Test-Path "$env:USERPROFILE\.vercel") {
  Write-Host "Removing existing Vercel credentials..."
  Remove-Item -Recurse -Force "$env:USERPROFILE\.vercel"
}

# 2. Ensure required environment variables are set in .env.local
$envFile = Join-Path (Get-Location) ".env.local"
if (-Not (Test-Path $envFile)) {
  Write-Host "Creating .env.local with placeholder values..."
  @"
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-strong-secret
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
GMAIL_USER=your.email@example.com
GMAIL_APP_PASSWORD=your-app-password
"@ | Set-Content -Path $envFile -Encoding UTF8
  Write-Host ".env.local created. Please edit it and replace placeholder values before proceeding."
  # Open the file in default editor for convenience
  if ($PSVersionTable.PSVersion.Major -ge 5) { Start-Process -FilePath $envFile }
  exit 0
}

# 3. Install node dependencies (use npm ci for reproducible install)
Write-Host "Installing node modules..."
npm ci
if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed"; exit 1 }

# 4. Vercel authentication – token based (non‑interactive)
if (-Not $env:VERCEL_TOKEN) {
  Write-Host "No VERCEL_TOKEN found in environment."
  $token = Read-Host "Enter your Vercel token (create one at https://vercel.com/account/settings/tokens)"
  if ([string]::IsNullOrWhiteSpace($token)) { Write-Error "Token required"; exit 1 }
  # Persist for the current user
  [System.Environment]::SetEnvironmentVariable("VERCEL_TOKEN", $token, "User")
  Write-Host "VERCEL_TOKEN saved to user environment. Restart this PowerShell session to use it."
  exit 0
}

# 5. Link the project to Vercel (run once)
if (-Not (Test-Path ".vercel")) {
  Write-Host "Linking project to Vercel..."
  vercel link --yes
  if ($LASTEXITCODE -ne 0) { Write-Error "vercel link failed"; exit 1 }
}

# 6. Start the development server
Write-Host "Starting local dev server..."
# Use Vercel dev for full Vercel environment (includes serverless functions)
vercel dev
