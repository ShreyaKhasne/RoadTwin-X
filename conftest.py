import os
import tempfile

import pytest
from fastapi.testclient import TestClient

_database = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_database.close()
os.environ["ROADTWIN_DATABASE_URL"] = f"sqlite:///{_database.name}"

from app.main import app  # noqa: E402


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
