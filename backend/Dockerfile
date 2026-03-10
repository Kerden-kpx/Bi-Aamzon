FROM python:3.11-slim-bookworm

ARG APT_MIRROR=
ARG PIP_INDEX_URL=https://pypi.org/simple
ARG PIP_EXTRA_INDEX_URL=https://pypi.org/simple
ARG PIP_TRUSTED_HOST="pypi.org files.pythonhosted.org"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_EXTRA_INDEX_URL=${PIP_EXTRA_INDEX_URL} \
    PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST}

WORKDIR /app

RUN set -e; \
    if [ -n "${APT_MIRROR}" ]; then \
        case "${APT_MIRROR}" in \
            *://*) APT_MIRROR_URL="${APT_MIRROR}" ;; \
            *) APT_MIRROR_URL="https://${APT_MIRROR}" ;; \
        esac; \
        if [ -f /etc/apt/sources.list ]; then \
            sed -i "s@https\?://[^ ]\\+debian.org@${APT_MIRROR_URL}@g" /etc/apt/sources.list; \
        fi; \
        if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
            sed -i "s@https\?://[^ ]\\+debian.org@${APT_MIRROR_URL}@g" /etc/apt/sources.list.d/debian.sources; \
        fi; \
    fi; \
    export DEBIAN_FRONTEND=noninteractive; \
    apt-get -o Acquire::ForceIPv4=true -o Acquire::Retries=5 update; \
    apt-get install -y --no-install-recommends ca-certificates; \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --prefer-binary --default-timeout=600 --retries 10 -r /app/requirements.txt

COPY app /app/app
COPY scripts /app/scripts
RUN mkdir -p /app/files /app/uploads

EXPOSE 18765

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "18765"]
