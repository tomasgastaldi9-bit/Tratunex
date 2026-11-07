# Tratunex

Plataforma para que cualquier empresa prospecte clientes en frío con un agente de voz que llama por teléfono, detecta si hay un cliente potencial y deja cada llamada transcripta, resumida y clasificada en un CRM con seguimiento automático.

## Alcance del MVP

Cada empresa entrena a su agente desde un dashboard (contexto, conocimiento, instrucciones y criterios), busca o importa prospectos, los llama con Vapi + Twilio y gestiona el resultado en un pipeline de 7 etapas. Los seguimientos ("llamame el jueves") se ejecutan solos desde un cron. La demo muestra dos empresas de rubros distintos con el mismo sistema. La aplicación todavía no está implementada.

## Equipo

| Integrante | Responsabilidad |
|---|---|
| Tomás | Plataforma (repo, auth, multi-empresa, cron, deploy) y prospección |
| Vale | Dashboard de entrenamiento del agente |
| Bautista | Voz, número y llamadas |
| Nano | CRM, pipeline y seguimiento |

## Documentación del proyecto

- [Brief del MVP: alcance, contratos, ownership y tareas](docs/BRIEF.md)
- [Guía para contribuir](CONTRIBUTING.md)
- [Flujo de desarrollo y coordinación](docs/DEVELOPMENT_WORKFLOW.md)

El brief es la fuente de verdad para stack, contratos, seguridad, responsabilidades e integraciones de la demo.
