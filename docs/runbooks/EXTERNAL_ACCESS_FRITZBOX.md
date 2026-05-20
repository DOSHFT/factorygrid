# External Access: FRITZ!Box 6670 Cable

## Recommended Path
Use FRITZ!Box WireGuard VPN for FactoryGrid access. Do not expose RuFloUI, OpenHands, LiteLLM, vLLM, or Qdrant directly to the public internet.

## If Static Port Sharing Is Required
FactoryGrid currently binds web ports to `127.0.0.1`, so the FRITZ!Box cannot reach them directly. Before creating a FRITZ!Box rule, place an authenticated TLS reverse proxy in front of RuFloUI and expose only that proxy.

Minimum safe target:
- External TCP 443 -> reverse proxy TCP 443 on BlackBeast
- Reverse proxy -> `http://127.0.0.1:28588`
- Basic auth or SSO required
- No direct public forwarding to ports `28580`, `28588`, `3000`, `4000`, `6333`, or `8000`


## Minimal Caddy Reverse Proxy on BlackBeast
Run this in the `revelation` WSL instance after DNS/MyFRITZ points at the FritzBox public endpoint. This exposes only HTTPS 443 and keeps RuFloUI bound to localhost.

```bash
sudo apt-get update
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl apache2-utils
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
read -rsp "RuFloUI password: " RUFLO_PASS; echo
HASH=$(printf '%s\n' "$RUFLO_PASS" | htpasswd -nBiB factoryadmin | cut -d: -f2-)
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
<myfritz-or-domain> {
  encode zstd gzip
  basicauth {
    factoryadmin $HASH
  }
  reverse_proxy 127.0.0.1:28588
}
EOF
unset RUFLO_PASS HASH
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

For a self-signed internal-only test, replace `<myfritz-or-domain>` with `:443` and add `tls internal` inside the site block, but expect browser trust warnings until the local CA is trusted.

## Windows Firewall Rule
Allow inbound TCP 443 to the WSL-hosted reverse proxy only. Do not open the backend service ports.

```powershell
New-NetFirewallRule -DisplayName "FactoryGrid RuFloUI HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

After enabling FRITZ!Box sharing, verify from a non-home network:

```bash
curl -I https://<myfritz-or-domain>/
curl -u factoryadmin:<password> https://<myfritz-or-domain>/api/health
```

Expected: unauthenticated requests get `401`, authenticated requests reach RuFloUI, and raw OpenHands/LiteLLM/vLLM/Qdrant ports remain unreachable from the internet.

## FRITZ!Box Menu Path
1. Open `http://fritz.box`.
2. Check `Internet > Online Monitor`.
   - Public IPv4 present: IPv4 port sharing can work.
   - DS-Lite / CGNAT only: IPv4 inbound port sharing will not work; use IPv6 sharing, MyFRITZ, or WireGuard VPN.
3. Go to `Internet > Permit Access > Port Sharing`.
4. Select `Add Device for Sharing`.
5. Select the Windows host `BlackBeast`.
6. Add a new sharing:
   - Application: Other application
   - Protocol: TCP
   - Port to device: reverse proxy port, normally `443`
   - External port: `443`
7. Use MyFRITZ or DynDNS for a stable name.

## Verification
From outside the home network, test:

```bash
curl -I https://<myfritz-or-domain>/
```

Expected:
- TLS certificate is valid.
- Authentication is required.
- The backend does not expose raw `/api`, OpenHands, LiteLLM, vLLM, or Qdrant without authentication.
