# TLS: Trusting Caddy's Internal CA (LAN Pilots)

StacksOS uses Caddy as an HTTPS reverse proxy. In this environment, Caddy is configured with `tls internal`, which means:

- HTTPS works immediately without a public domain.
- Browsers will show a TLS warning until the client machine trusts Caddy's internal Root CA.

This doc explains how to export the Root CA from the StacksOS host and trust it on client machines.

---

## Option 1 (LAN): Trust Caddy's Internal Root CA

### 1) Export the Root CA on the StacksOS host

On `stacksos` (`192.168.1.233`):

```bash
cd /home/jake/projects/stacksos
sudo bash ops/stacksos/caddy/export-internal-ca.sh
```

This writes:
- `/etc/caddy/pki/caddy-internal-root.crt`

It also prints a SHA-256 fingerprint. You'll use that fingerprint to verify the cert on the client machine.

### 2) Copy the cert to your client machine

From the client machine:

```bash
scp jake@192.168.1.233:/etc/caddy/pki/caddy-internal-root.crt .
```

### 3) Verify the fingerprint (recommended)

On the client machine:

```bash
openssl x509 -in caddy-internal-root.crt -noout -fingerprint -sha256
```

Compare it to the fingerprint printed by the export script on the server.

### 4) Trust it (per OS)

Ubuntu/Debian:

```bash
sudo cp caddy-internal-root.crt /usr/local/share/ca-certificates/stacksos-caddy.crt
sudo update-ca-certificates
```

macOS:

```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain caddy-internal-root.crt
```

Windows (PowerShell as Administrator):

```powershell
certutil -addstore -f Root caddy-internal-root.crt
```

iOS/iPadOS:
- Transfer `caddy-internal-root.crt` to the device (AirDrop/email/etc).
- Install it: Settings -> General -> VPN & Device Management.
- Enable full trust: Settings -> General -> About -> Certificate Trust Settings.

Firefox (if it does not use OS trust):
- `about:config` -> `security.enterprise_roots.enabled = true`

### 5) Re-test

After trusting the CA, `https://192.168.1.233` should load without warnings.

---

## Option 2 (Best): Use a Real Certificate

If you can give StacksOS a DNS name and allow ACME validation, switch Caddy from `tls internal` to a public certificate
(Let's Encrypt, ZeroSSL, etc.). This removes the need to distribute a Root CA.

For LAN-only pilots without DNS/public reachability, Option 1 is the practical path.

---

## Notes / Gotchas

- Caddy's internal CA is stored under `/var/lib/caddy`. If you wipe that directory, the CA will rotate and clients must
  trust the new CA again.
- The Root CA private key is sensitive and remains protected (`/var/lib/caddy/.../root.key` is mode `0600`).

