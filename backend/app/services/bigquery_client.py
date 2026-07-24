from google.cloud import bigquery

from app.core.config import settings


class BigQueryClient:
    def __init__(self) -> None:
        self.project = settings.bigquery_project
        self.dataset = settings.bigquery_dataset
        self.client = bigquery.Client(project=self.project)

    def table_ref(self, table_name: str) -> str:
        return f"{self.project}.{self.dataset}.{table_name}"
