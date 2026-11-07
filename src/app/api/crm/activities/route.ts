import { listPipelineRequest } from "@/features/crm/server/pipeline-api";
export const GET = (request: Request) => listPipelineRequest(request, "activities");
