FROM python:3.11-slim

WORKDIR /app

# 安裝編譯 mysql 連線套件需要的系統相依
RUN apt-get update && \
    apt-get install -y gcc default-libmysqlclient-dev && \
    pip install --upgrade pip

COPY ./env/flask/requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

# 開發模式：--reload 讓改 code 自動重啟
CMD ["flask", "run", "--host=0.0.0.0", "--port=5000", "--reload"]
