import os

import uvicorn


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "18765"))
    reload = os.getenv("RELOAD", "1").lower() not in {"0", "false", "no"}

    uvicorn.run("app.main:app", host=host, port=port, reload=reload)
