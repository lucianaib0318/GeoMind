# Security Notes

GeoMind is designed to keep local credentials and generated private artifacts out of the public repository.

## Do Not Commit

- `.env` or any `.env.*` file except `.env.example`
- Tencent Location Service keys
- Feishu document URLs or internal document tokens from private tenants
- generated HTML previews, screenshots, GIFs, JSON outputs, or geocode caches
- SSH keys, private certificates, or local browser profiles

The repository `.gitignore` excludes these paths by default:

- `.env`
- `.env.*`
- `cache/`
- `output/`
- `dist/`
- `node_modules/`
- `examples/sample-output.json`
- `*.key`
- `*.pem`
- `*.secret.*`

## Key Handling

Use `.env` locally:

```bash
TENCENT_MAP_KEY=your-tencent-location-service-key
```

The generated HTML embeds the Tencent JSAPI GL key at render time. Treat `output/geomind.html` as a generated artifact and do not commit it.

## Feishu Publishing

`npm run publish:feishu` writes previews and attachments into a Feishu document through your authenticated local Feishu CLI session. The repository does not store access tokens. Authentication remains in the local Feishu CLI configuration.
