import os

import uvicorn


if __name__ == "__main__":
    default_host = "127.0.0.1" if os.name == "nt" else "0.0.0.0"
    host = os.getenv("HOST", default_host)
    port = int(os.getenv("PORT", "18765"))
    reload = os.getenv("RELOAD", "1").lower() not in {"0", "false", "no"}

    uvicorn.run("app.main:app", host=host, port=port, reload=reload)
