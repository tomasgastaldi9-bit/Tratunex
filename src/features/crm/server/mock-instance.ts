import "server-only";
import { createMockCrm } from "./mock-crm";

// Same process-local instance for the public integration surface and demo read model.
export const mockCrm = createMockCrm();
