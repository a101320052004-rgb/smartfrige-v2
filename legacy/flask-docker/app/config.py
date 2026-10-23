import os
from pathlib import Path
from typing import Type


def _load_dotenv_file() -> None:
    for path in (Path.cwd() / '.env', Path(__file__).resolve().parents[1] / '.env'):
        if not path.is_file():
            continue
        for line in path.read_text(encoding='utf-8').splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith('#') or '=' not in stripped:
                continue
            key, value = stripped.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
        break


_load_dotenv_file()


def _read_secret(var_name: str, default: str | None = None) -> str | None:
    """優先讀 <VAR>_FILE 指向的檔案（Docker secret），其次 /run/secrets，再來環境變數。"""
    file_env = os.environ.get(f"{var_name}_FILE")
    if file_env:
        path = Path(file_env)
        if path.is_file():
            return path.read_text(encoding='utf-8').strip()
    secrets_path = Path('/run/secrets') / var_name.lower()
    if secrets_path.is_file():
        return secrets_path.read_text(encoding='utf-8').strip()
    value = os.environ.get(var_name)
    if value is not None:
        return value
    return default


class BaseConfig:
    SECRET_KEY = _read_secret('SECRET_KEY', 'dev-secret')
    MYSQL_HOST = os.environ.get('MYSQL_HOST', 'mysql')
    MYSQL_DATABASE = os.environ.get('MYSQL_DATABASE', 'smartfridge')
    MYSQL_USER = os.environ.get('MYSQL_USER', 'smartfridge')
    MYSQL_PASSWORD = _read_secret('MYSQL_PASSWORD')
    MYSQL_PORT = int(os.environ.get('MYSQL_PORT', 3306))
    MYSQL_CHARSET = 'utf8mb4'
    GEMINI_API_KEY = _read_secret('GEMINI_API_KEY') or _read_secret('GOOGLE_API_KEY')
    GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')


class DevelopmentConfig(BaseConfig):
    DEBUG = True


class TestingConfig(BaseConfig):
    TESTING = True
    MYSQL_DATABASE = os.environ.get('MYSQL_DATABASE', 'smartfridge_test')


class ProductionConfig(BaseConfig):
    DEBUG = False


_CONFIG_MAP: dict[str, Type[BaseConfig]] = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
}


def get_config(env_name: str | None = None) -> Type[BaseConfig]:
    name = (env_name or os.environ.get('APP_ENV') or os.environ.get('FLASK_ENV') or 'development').lower()
    return _CONFIG_MAP.get(name, DevelopmentConfig)
